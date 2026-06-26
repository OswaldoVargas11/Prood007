import { Inject, Injectable } from '@nestjs/common';
import {
  AI_ENGINE,
  Jurisdiction,
  TaskStatus,
  type AiEngine,
  type AiToolExecutor,
  type AiToolInvocation,
  type AiToolOutcome,
} from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AiQuotaService } from './ai-quota.service';
import { AuditService } from '../audit/audit.service';
import { TasksService } from '../tasks/tasks.service';
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS } from './ai-agent.tools';
import { legalSourceLinks, type LegalJurisdiction } from './legal-sources';
import type { RequestUser } from '../auth/auth.types';

/** Respuesta del asistente agéntico: texto final + traza de herramientas usadas (transparencia). */
export interface AiAgentResponse {
  output: string;
  /** Herramientas ejecutadas en orden (sin volcar datos: solo nombre y si fallaron). */
  steps: { tool: string; isError: boolean }[];
  model: string | null;
  /** Motivo de parada del turno ('end_turn', 'max_steps', ...). */
  stopReason: string;
}

const OPEN_TASK_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

/**
 * Asistente AGÉNTICO del despacho: a diferencia de los métodos one-shot de `AiService`, aquí el modelo
 * dispone de HERRAMIENTAS (tool-use) y el motor itera hasta resolver la petición consultando datos reales.
 * El executor mapea cada herramienta a una consulta Prisma SIEMPRE acotada por `tenantId` (defensa en
 * profundidad sobre la RLS). Mayoría de herramientas de LECTURA + una de ESCRITURA acotada (`create_task`,
 * reversible y no fiscal, que reutiliza `TasksService` con sus validaciones). Consume cuota y deja traza de
 * auditoría (`ai.agent_run`), contabilizando el coste real en tokens de TODAS las llamadas del turno.
 */
@Injectable()
export class AiAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: AiQuotaService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  /** Ejecuta un turno agéntico para el usuario y devuelve la respuesta final + traza. */
  async run(user: RequestUser, message: string): Promise<AiAgentResponse> {
    await this.quota.consume(user);

    const exec: AiToolExecutor = (invocation) => this.execute(user, invocation);
    const result = await this.engine.runAgent(
      { system: AGENT_SYSTEM_PROMPT, userMessage: message, tools: AGENT_TOOLS, maxSteps: 6 },
      exec,
    );

    await this.quota.recordUsage(
      user,
      result.usage?.inputTokens ?? 0,
      result.usage?.outputTokens ?? 0,
    );
    const day = new Date().toISOString().slice(0, 10);
    await this.audit
      .log(user, 'ai.agent_run', 'AiUsage', day, {
        tools: result.steps.map((s) => s.tool),
        steps: result.steps.length,
        stopReason: result.stopReason,
      })
      .catch(() => undefined);

    return {
      output: result.text,
      steps: result.steps.map((s) => ({ tool: s.tool, isError: s.isError })),
      model: result.model ?? this.engine.model(),
      stopReason: result.stopReason,
    };
  }

  // ── Executor de herramientas (tenant-scoped; lectura + escritura acotada) ──────────────────────────

  private async execute(user: RequestUser, inv: AiToolInvocation): Promise<AiToolOutcome> {
    try {
      switch (inv.name) {
        case 'search_matters':
          return { content: await this.searchMatters(user, inv.input) };
        case 'get_matter':
          return { content: await this.getMatter(user, inv.input) };
        case 'list_open_tasks':
          return { content: await this.listOpenTasks(user, inv.input) };
        case 'find_client':
          return { content: await this.findClient(user, inv.input) };
        case 'list_documents':
          return { content: await this.listDocuments(user, inv.input) };
        case 'legal_research':
          return { content: this.legalResearch(user, inv.input) };
        case 'create_task':
          return { content: await this.createTask(user, inv.input) };
        default:
          return { content: `Herramienta desconocida: ${inv.name}`, isError: true };
      }
    } catch (e) {
      return {
        content: `No se pudo completar la consulta: ${(e as Error).message}`,
        isError: true,
      };
    }
  }

  private async searchMatters(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const query = str(input, 'query');
    const limit = int(input, 'limit', 10, 25);
    const matters = await this.prisma.matter.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query
          ? {
              OR: [
                { reference: { contains: query, mode: 'insensitive' as const } },
                { title: { contains: query, mode: 'insensitive' as const } },
                { opposingParty: { contains: query, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        reference: true,
        title: true,
        type: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { reference: 'desc' },
      take: limit,
    });
    if (matters.length === 0)
      return json({ count: 0, matters: [], note: 'Sin expedientes que coincidan.' });
    return json({
      count: matters.length,
      matters: matters.map((m) => ({
        reference: m.reference,
        title: m.title,
        type: m.type,
        status: m.status,
        client: m.client?.name ?? null,
      })),
    });
  }

  private async getMatter(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const reference = str(input, 'reference');
    if (!reference) return json({ error: 'Falta la referencia del expediente.' });
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference },
      select: {
        id: true,
        reference: true,
        title: true,
        type: true,
        status: true,
        opposingParty: true,
        court: true,
        caseNumber: true,
        proceduralPhase: true,
        client: { select: { name: true, taxId: true } },
        lawyer: { select: { fullName: true } },
      },
    });
    if (!matter)
      return json({ found: false, note: `No existe expediente con referencia ${reference}.` });
    const [taskCount, documentCount] = await Promise.all([
      this.prisma.task.count({ where: { tenantId: user.tenantId, matterId: matter.id } }),
      this.prisma.document.count({ where: { tenantId: user.tenantId, matterId: matter.id } }),
    ]);
    return json({
      found: true,
      reference: matter.reference,
      title: matter.title,
      type: matter.type,
      status: matter.status,
      opposingParty: matter.opposingParty ?? null,
      court: matter.court ?? null,
      caseNumber: matter.caseNumber ?? null,
      proceduralPhase: matter.proceduralPhase ?? null,
      client: matter.client ? { name: matter.client.name, taxId: matter.client.taxId } : null,
      lawyer: matter.lawyer?.fullName ?? null,
      taskCount,
      documentCount,
    });
  }

  private async listOpenTasks(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const limit = int(input, 'limit', 20, 50);
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: OPEN_TASK_STATUSES },
        ...(matterReference ? { matter: { reference: matterReference } } : {}),
      },
      select: {
        title: true,
        status: true,
        dueDate: true,
        matter: { select: { reference: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
    });
    if (tasks.length === 0)
      return json({ count: 0, tasks: [], note: 'No hay tareas abiertas que coincidan.' });
    return json({
      count: tasks.length,
      tasks: tasks.map((t) => ({
        title: t.title,
        status: t.status,
        dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
        matter: t.matter?.reference ?? null,
      })),
    });
  }

  private async findClient(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const taxId = str(input, 'taxId');
    const name = str(input, 'name');
    if (!taxId && !name)
      return json({ error: 'Indica un identificador fiscal o un nombre para buscar.' });
    const clients = await this.prisma.client.findMany({
      where: {
        tenantId: user.tenantId,
        ...(taxId ? { taxId } : {}),
        ...(name ? { name: { contains: name, mode: 'insensitive' as const } } : {}),
      },
      select: { id: true, name: true, taxId: true },
      take: 10,
    });
    if (clients.length === 0)
      return json({ count: 0, clients: [], note: 'Sin clientes que coincidan.' });
    const withCounts = await Promise.all(
      clients.map(async (c) => ({
        name: c.name,
        taxId: c.taxId,
        matterCount: await this.prisma.matter.count({
          where: { tenantId: user.tenantId, clientId: c.id },
        }),
      })),
    );
    return json({ count: withCounts.length, clients: withCounts });
  }

  private async listDocuments(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true },
    });
    if (!matter)
      return json({
        found: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    const documents = await this.prisma.document.findMany({
      where: { tenantId: user.tenantId, matterId: matter.id },
      select: { name: true },
      take: 100,
    });
    return json({
      found: true,
      matter: matterReference,
      count: documents.length,
      documents: documents.map((d) => d.name),
    });
  }

  /**
   * Investigación jurídica: enlaces a fuentes oficiales (CENDOJ/BOE en ES, Poder Judicial/DGII en RD)
   * con los términos ya cargados. No descarga contenido (sin scraping/copyright); apunta a la fuente
   * primaria. Jurisdicción: la indicada o, por defecto, la del despacho.
   */
  private legalResearch(user: RequestUser, input: Record<string, unknown>): string {
    const query = str(input, 'query');
    if (!query) return json({ error: 'Indica los términos de búsqueda jurídica.' });
    const j = str(input, 'jurisdiction');
    const jurisdiction: LegalJurisdiction =
      j === 'do' || j === 'es' ? j : user.jurisdiction === Jurisdiction.DO ? 'do' : 'es';
    return json({
      jurisdiction,
      query,
      sources: legalSourceLinks(jurisdiction, query),
      disclaimer:
        'Enlaces a fuentes oficiales para verificar la fuente primaria. No sustituye el criterio del ' +
        'letrado ni constituye asesoramiento.',
    });
  }

  // ── Escritura (acotada, reversible, no fiscal) ────────────────────────────────────────────────────

  /**
   * CREA una tarea/plazo reutilizando `TasksService` (valida tenant del expediente, audita `task.created`
   * y notifica). Resuelve la referencia del expediente a su id (acotado por tenant). No toca nada fiscal.
   */
  private async createTask(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const title = str(input, 'title');
    if (!title || title.length < 2) {
      return json({ error: 'El título de la tarea es obligatorio (mínimo 2 caracteres).' });
    }
    const description = str(input, 'description');

    const dueRaw = str(input, 'dueDate');
    let dueDate: string | undefined;
    if (dueRaw) {
      const d = new Date(dueRaw);
      if (Number.isNaN(d.getTime())) {
        return json({
          error: `Fecha de vencimiento no válida: ${dueRaw}. Usa el formato YYYY-MM-DD.`,
        });
      }
      dueDate = d.toISOString();
    }

    const matterReference = str(input, 'matterReference');
    let matterId: string | undefined;
    if (matterReference) {
      const matter = await this.prisma.matter.findFirst({
        where: { tenantId: user.tenantId, reference: matterReference },
        select: { id: true },
      });
      if (!matter) {
        return json({
          created: false,
          note: `No existe expediente con referencia ${matterReference}; no se ha creado la tarea.`,
        });
      }
      matterId = matter.id;
    }

    const task = await this.tasks.create(user, {
      title: title.slice(0, 200),
      description,
      dueDate,
      matterId,
    });
    return json({
      created: true,
      taskId: task.id,
      title: task.title,
      matter: matterReference ?? null,
      dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────

/** Lee un campo string no vacío del input de la herramienta (o undefined). */
function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** Lee un entero positivo del input, acotado a `max`, con valor por defecto. */
function int(input: Record<string, unknown>, key: string, def: number, max: number): number {
  const n = Number(input[key]);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
}

/** Serializa el resultado de una herramienta a JSON compacto para devolvérselo al modelo. */
function json(value: unknown): string {
  return JSON.stringify(value);
}
