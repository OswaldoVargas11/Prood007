import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  AI_ENGINE,
  Jurisdiction,
  MatterStatus,
  Role,
  TaskStatus,
  type AiEngine,
  type AiMessage,
  type AiToolExecutor,
  type AiToolInvocation,
  type AiToolOutcome,
} from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AiQuotaService } from './ai-quota.service';
import { AuditService } from '../audit/audit.service';
import { TasksService } from '../tasks/tasks.service';
import { DocumentsService } from '../documents/documents.service';
import { TemplatesService } from '../templates/templates.service';
import { ClientsService } from '../clients/clients.service';
import { MattersService } from '../matters/matters.service';
import { PresentationsService } from '../presentations/presentations.service';
import { AiSearchService } from './ai-search.service';
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS } from './ai-agent.tools';
import { legalSourceLinks, type LegalJurisdiction } from './legal-sources';
import type { RequestUser } from '../auth/auth.types';

/** Una acción de ESCRITURA propuesta por el agente y pendiente de confirmación del letrado (HITL). */
export interface PendingWrite {
  action: string;
  summary: string;
}

/** Respuesta del asistente agéntico: texto final + traza de herramientas usadas (transparencia). */
export interface AiAgentResponse {
  output: string;
  /** Herramientas ejecutadas en orden (sin volcar datos: solo nombre y si fallaron). */
  steps: { tool: string; isError: boolean }[];
  model: string | null;
  /** Motivo de parada del turno ('end_turn', 'max_steps', ...). */
  stopReason: string;
  /** Acciones de escritura que el agente quiso hacer pero quedaron a la espera de confirmación. */
  pendingWrites: PendingWrite[];
}

/** Evento del turno en STREAMING: progreso por herramienta ('tool') o respuesta final ('done'). */
export type AgentStreamEvent =
  | { type: 'tool'; tool: string }
  | { type: 'text'; delta: string }
  | ({ type: 'done' } & AiAgentResponse);

const OPEN_TASK_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];
/** Herramientas que MUTAN estado: requieren confirmación humana salvo que el cliente la conceda. */
const WRITE_TOOLS = new Set([
  'create_task',
  'draft_and_save_document',
  'create_template',
  'create_client',
  'create_matter',
  'apply_presentation_to_matter',
]);
const ACTIVE_MATTER_STATUSES = [MatterStatus.OPEN, MatterStatus.IN_PROGRESS];
/** Tope de mensajes de historial que se reenvían al modelo (control de coste/contexto). */
const MAX_HISTORY_MESSAGES = 20;

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
    private readonly documents: DocumentsService,
    private readonly templates: TemplatesService,
    private readonly clients: ClientsService,
    private readonly matters: MattersService,
    private readonly presentations: PresentationsService,
    private readonly search: AiSearchService,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  /**
   * Ejecuta un turno agéntico para el usuario y devuelve la respuesta final + traza. Acepta el historial
   * de conversación previo (multi-turno); se acota a los últimos mensajes para controlar coste/contexto.
   */
  async run(
    user: RequestUser,
    message: string,
    history: AiMessage[] = [],
    allowWrites = false,
  ): Promise<AiAgentResponse> {
    return this.runCore(user, message, history, allowWrites);
  }

  /**
   * Variante STREAMING: emite eventos de progreso ('tool' por cada herramienta = thinking-traces) y un
   * 'done' final con la respuesta. `isAborted` permite que el usuario detenga el turno (botón Stop): el
   * executor corta en cuanto se aborta, sin ejecutar más herramientas.
   */
  async runStream(
    user: RequestUser,
    message: string,
    history: AiMessage[] = [],
    allowWrites = false,
    opts: { onEvent: (e: AgentStreamEvent) => void; isAborted: () => boolean } = {
      onEvent: () => undefined,
      isAborted: () => false,
    },
  ): Promise<void> {
    const res = await this.runCore(
      user,
      message,
      history,
      allowWrites,
      (tool) => opts.onEvent({ type: 'tool', tool }),
      opts.isAborted,
      (delta) => opts.onEvent({ type: 'text', delta }),
    );
    opts.onEvent({ type: 'done', ...res });
  }

  /** Núcleo del turno agéntico, compartido por `run` y `runStream`. */
  private async runCore(
    user: RequestUser,
    message: string,
    history: AiMessage[],
    allowWrites: boolean,
    onTool?: (name: string) => void,
    isAborted?: () => boolean,
    onText?: (delta: string) => void,
  ): Promise<AiAgentResponse> {
    await this.quota.consume(user);

    // HITL: salvo confirmación explícita del cliente, las herramientas de escritura NO se ejecutan; se
    // proponen y se recogen aquí para que la UI pida confirmación antes de actuar.
    const pendingWrites: PendingWrite[] = [];
    const exec: AiToolExecutor = (invocation) => {
      if (isAborted?.()) {
        return Promise.resolve({ content: 'Operación cancelada por el usuario.', isError: true });
      }
      onTool?.(invocation.name);
      return this.execute(user, invocation, allowWrites, pendingWrites);
    };

    let result;
    try {
      result = await this.engine.runAgent(
        {
          system: AGENT_SYSTEM_PROMPT,
          userMessage: message,
          history: history.slice(-MAX_HISTORY_MESSAGES),
          tools: AGENT_TOOLS,
          maxSteps: 6,
        },
        exec,
        onText ? { onText } : undefined,
      );
    } catch (e) {
      // El agente NUNCA debe devolver 500: ante un fallo del proveedor (rate-limit persistente, caída),
      // degrada con elegancia. Se re-lanza solo el HttpException intencionado (p. ej. 503 ai.notConfigured).
      if (e instanceof HttpException) throw e;
      return {
        output:
          'No he podido completar la consulta ahora mismo (el servicio de IA está ocupado o no ' +
          'disponible). Inténtalo de nuevo en unos segundos.',
        steps: [],
        model: this.engine.model(),
        stopReason: 'error',
        pendingWrites,
      };
    }

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
      pendingWrites,
    };
  }

  // ── Executor de herramientas (tenant-scoped; lectura + escritura acotada) ──────────────────────────

  private async execute(
    user: RequestUser,
    inv: AiToolInvocation,
    allowWrites: boolean,
    pendingWrites: PendingWrite[],
  ): Promise<AiToolOutcome> {
    // Gate HITL: una escritura sin confirmación NO se ejecuta; se propone y se devuelve al modelo para que
    // se lo explique al usuario y pida su confirmación (la UI re-envía el turno con allowWrites=true).
    if (WRITE_TOOLS.has(inv.name) && !allowWrites) {
      const summary = describeWrite(inv);
      pendingWrites.push({ action: inv.name, summary });
      return {
        content: json({
          status: 'requires_confirmation',
          action: inv.name,
          summary,
          note: 'NO ejecutada. Explica al usuario exactamente esto y pídele que confirme antes de hacerlo.',
        }),
      };
    }
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
        case 'firm_overview':
          return { content: await this.firmOverview(user) };
        case 'search_firm_knowledge':
          return { content: await this.searchFirmKnowledge(user, inv.input) };
        case 'legal_research':
          return { content: this.legalResearch(user, inv.input) };
        case 'create_task':
          return { content: await this.createTask(user, inv.input) };
        case 'draft_and_save_document':
          return { content: await this.draftAndSaveDocument(user, inv.input) };
        case 'create_template':
          return { content: await this.createTemplate(user, inv.input) };
        case 'check_conflict_of_interest':
          return { content: await this.checkConflictOfInterest(user, inv.input) };
        case 'get_client_detail':
          return { content: await this.getClientDetail(user, inv.input) };
        case 'get_matter_timeline':
          return { content: await this.getMatterTimeline(user, inv.input) };
        case 'list_matters_by_status':
          return { content: await this.listMattersByStatus(user, inv.input) };
        case 'create_client':
          return { content: await this.createClient(user, inv.input) };
        case 'create_matter':
          return { content: await this.createMatter(user, inv.input) };
        case 'apply_presentation_to_matter':
          return { content: await this.applyPresentationToMatter(user, inv.input) };
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

  /**
   * Búsqueda SEMÁNTICA sobre el TEXTO de los documentos/expedientes indexados (RAG). Devuelve fragmentos
   * citables (referencia + extracto), no solo metadatos. Si los embeddings no están configurados, lo
   * indica sin romper. Tenant-scoped (RLS) dentro de AiSearchService.
   */
  private async searchFirmKnowledge(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const query = str(input, 'query');
    if (!query) return json({ error: 'Indica qué buscar en el conocimiento del despacho.' });
    const limit = int(input, 'limit', 6, 12);
    try {
      const hits = await this.search.search(user, query, limit);
      if (hits.length === 0) {
        return json({ count: 0, hits: [], note: 'Sin coincidencias en los documentos indexados.' });
      }
      return json({
        count: hits.length,
        hits: hits.map((h) => ({
          ref: h.refLabel,
          excerpt: h.excerpt.slice(0, 400),
          score: Math.round(h.score * 100) / 100,
        })),
      });
    } catch {
      return json({
        available: false,
        note: 'La búsqueda semántica no está disponible (faltan embeddings; configura VOYAGE_API_KEY).',
      });
    }
  }

  /** Visión rápida del despacho: expedientes activos, tareas abiertas y plazos vencidos. */
  private async firmOverview(user: RequestUser): Promise<string> {
    const now = new Date();
    const [activeMatters, openTasks, overdueTasks] = await Promise.all([
      this.prisma.matter.count({
        where: { tenantId: user.tenantId, status: { in: ACTIVE_MATTER_STATUSES } },
      }),
      this.prisma.task.count({
        where: { tenantId: user.tenantId, status: { in: OPEN_TASK_STATUSES } },
      }),
      this.prisma.task.count({
        where: {
          tenantId: user.tenantId,
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lt: now },
        },
      }),
    ]);
    return json({ activeMatters, openTasks, overdueTasks });
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

  /**
   * Redacta y GUARDA un escrito en el expediente reutilizando `DocumentsService.saveAiDraft` (PDF con
   * membrete, pipeline cifrado, versión 1 en revisión PENDING). El contenido lo redacta el modelo. No es
   * fiscal y es reversible. Resuelve la referencia del expediente a su id (acotado por tenant).
   */
  private async draftAndSaveDocument(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const title = str(input, 'title');
    const content = typeof input.content === 'string' ? input.content : '';
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });
    if (!title || title.length < 2) {
      return json({ error: 'Indica un título para el documento (mínimo 2 caracteres).' });
    }
    if (content.trim().length === 0) {
      return json({ error: 'Falta el contenido del documento a guardar.' });
    }
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true },
    });
    if (!matter) {
      return json({
        created: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha guardado el documento.`,
      });
    }
    const { document } = await this.documents.saveAiDraft(user, {
      matterId: matter.id,
      title,
      bodyText: content,
    });
    return json({
      created: true,
      documentId: document.id,
      name: document.name,
      matter: matterReference,
      status: 'borrador pendiente de revisión',
    });
  }

  /**
   * CREA una plantilla reutilizable en la biblioteca del despacho vía `TemplatesService.create` (valida
   * tenant, audita). El modelo redacta el `body` (con campos {{merge}}). No fiscal, reversible.
   */
  private async createTemplate(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const name = str(input, 'name');
    const body = typeof input.body === 'string' ? input.body : '';
    if (!name || name.length < 2) {
      return json({ error: 'Indica un nombre para la plantilla (mínimo 2 caracteres).' });
    }
    if (body.trim().length === 0) {
      return json({ error: 'Falta el contenido (body) de la plantilla.' });
    }
    const description = str(input, 'description');
    const tpl = await this.templates.create(user, {
      name: name.slice(0, 200),
      body: body.slice(0, 100_000),
      description,
    });
    return json({ created: true, templateId: tpl.id, name: tpl.name });
  }

  /**
   * Revisa conflictos de interés (deontología): si la persona/empresa ya es cliente o ya aparece
   * como parte contraria en un expediente activo. Reutiliza ClientsService.conflictCheck (tenant-scoped).
   * Devuelve un resumen citable: coincidencias en clientes + expedientes afectados.
   */
  private async checkConflictOfInterest(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const query = str(input, 'query');
    if (!query || query.length < 2) {
      return json({ error: 'Indica el nombre o parte del mismo (mínimo 2 caracteres).' });
    }
    const result = await this.clients.conflictCheck(user, query);
    const hasConflict = result.matches.length > 0 || result.opposingMatters.length > 0;
    return json({
      query: result.query,
      hasConflict,
      clientMatches: result.matches.map((c) => ({
        name: c.name,
        taxId: c.taxId ?? null,
        matterCount: c.matters.length,
        matters: c.matters.map((m) => ({
          reference: m.reference,
          title: m.title,
          status: m.status,
        })),
      })),
      opposingMatters: result.opposingMatters.map((m) => ({
        reference: m.reference,
        title: m.title,
        opposingParty: m.opposingParty,
        status: m.status,
        clientName: m.client?.name ?? null,
      })),
      summary: hasConflict
        ? `CONFLICTO DETECTADO: ${result.matches.length} cliente(s) coincidente(s) y/o ${result.opposingMatters.length} expediente(s) con parte contraria igual.`
        : 'Sin conflictos detectados.',
    });
  }

  private async getClientDetail(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'Falta el ID del cliente.' });

    const client = await this.clients.findOne(user, clientId);

    const matterCount = await this.prisma.matter.count({
      where: { tenantId: user.tenantId, clientId },
    });

    return json({
      found: true,
      id: client.id,
      name: client.name,
      taxId: client.taxId,
      email: client.email ?? null,
      phone: client.phone ?? null,
      address: client.address ?? null,
      matterCount,
    });
  }

  private async getMatterTimeline(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true },
    });
    if (!matter) {
      return json({
        found: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    }

    // Delega a MattersService.timeline() que ya está acotado por tenant y matterId
    const timeline = await this.matters.timeline(user, matter.id);

    return json({
      found: true,
      matter: matterReference,
      eventCount: timeline.events.length,
      events: timeline.events,
    });
  }

  private async listMattersByStatus(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const status = str(input, 'status') as MatterStatus | undefined;
    if (!status || !['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'ARCHIVED'].includes(status)) {
      return json({
        error: 'Estado no válido. Elige uno de: OPEN, IN_PROGRESS, ON_HOLD, CLOSED, ARCHIVED.',
      });
    }
    const clientId = str(input, 'clientId');
    const page = int(input, 'page', 1, 100);
    const pageSize = int(input, 'pageSize', 20, 50);

    const result = await this.matters.findAll(user, page, pageSize, status, clientId);
    if (result.items.length === 0) {
      return json({
        count: 0,
        status,
        matters: [],
        pagination: { page: result.page, pageSize: result.pageSize, total: result.total },
        note: `No hay expedientes con estado ${status}.`,
      });
    }
    return json({
      count: result.items.length,
      status,
      matters: result.items.map((m) => ({
        id: m.id,
        reference: m.reference,
        title: m.title,
        type: m.type,
        client: m.client?.name ?? null,
        lawyer: m.lawyer?.fullName ?? null,
        openedAt: m.openedAt?.toISOString().slice(0, 10) ?? null,
      })),
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total },
    });
  }

  private async createClient(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const name = str(input, 'name');
    if (!name || name.length < 2) {
      return json({ error: 'El nombre del cliente es obligatorio (mínimo 2 caracteres).' });
    }
    const taxId = str(input, 'taxId');
    if (!taxId) {
      return json({ error: 'Identificador fiscal (NIF/CIF/RNC) obligatorio.' });
    }
    const email = str(input, 'email');
    const phone = str(input, 'phone');
    const address = str(input, 'address');
    const docTypeRaw = str(input, 'docType');
    const docType = docTypeRaw === 'PASSPORT' || docTypeRaw === 'OTHER' ? docTypeRaw : undefined;

    try {
      const client = await this.clients.create(user, {
        name: name.slice(0, 200),
        taxId,
        email,
        phone: phone ? phone.slice(0, 40) : undefined,
        address: address ? address.slice(0, 300) : undefined,
        docType: docType as any,
      });
      return json({
        created: true,
        clientId: client.id,
        name: client.name,
        taxId: client.taxId,
        taxIdKind: client.taxIdKind ?? null,
        message: `Cliente "${client.name}" creado exitosamente. Ya puedes crear expedientes asociándolo a este cliente.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      return json({
        created: false,
        error:
          msg.includes('invalid') || msg.includes('Invalid')
            ? 'Identificador fiscal no válido en esta jurisdicción.'
            : msg,
      });
    }
  }

  private async createMatter(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const title = str(input, 'title');
    if (!title || title.length < 2) {
      return json({ error: 'El título del expediente es obligatorio (mínimo 2 caracteres).' });
    }

    const type = str(input, 'type');
    if (!type || type.length < 2) {
      return json({ error: 'El tipo de asunto es obligatorio (mínimo 2 caracteres).' });
    }

    const clientName = str(input, 'clientName');
    if (!clientName) {
      return json({ error: 'Nombre del cliente obligatorio para crear expediente.' });
    }

    // Resuelve el clientName a su ID (búsqueda exacta o por coincidencia).
    const client = await this.prisma.client.findFirst({
      where: {
        tenantId: user.tenantId,
        OR: [
          { name: { equals: clientName, mode: 'insensitive' as const } },
          { name: { contains: clientName, mode: 'insensitive' as const } },
        ],
      },
      select: { id: true, name: true },
    });
    if (!client) {
      return json({
        created: false,
        note: `Cliente no encontrado: "${clientName}". Verifica el nombre exacto en el despacho.`,
      });
    }

    // Validación opcional del letrado (si se proporciona).
    let lawyerId: string | undefined;
    const lawyerIdInput = str(input, 'lawyerId');
    if (lawyerIdInput) {
      const lawyer = await this.prisma.user.findFirst({
        where: {
          id: lawyerIdInput,
          tenantId: user.tenantId,
          roles: { some: { role: { code: { in: [Role.LAWYER, Role.FIRM_ADMIN] } } } },
        },
        select: { id: true },
      });
      if (!lawyer) {
        return json({
          created: false,
          note: `Letrado no encontrado o sin permisos: ${lawyerIdInput}.`,
        });
      }
      lawyerId = lawyerIdInput;
    }

    // Campos opcionales de litigación.
    const opposingParty = str(input, 'opposingParty');
    const opposingPartyTaxId = str(input, 'opposingPartyTaxId');
    const opposingCounsel = str(input, 'opposingCounsel');
    const court = str(input, 'court');
    const caseNumber = str(input, 'caseNumber');
    const proceduralPhase = str(input, 'proceduralPhase');
    const reference = str(input, 'reference');

    try {
      const matter = await this.matters.create(user, {
        title: title.slice(0, 200),
        type: type.slice(0, 80),
        clientId: client.id,
        lawyerId,
        reference,
        opposingParty,
        opposingPartyTaxId,
        opposingCounsel,
        court,
        caseNumber,
        proceduralPhase,
      });

      return json({
        created: true,
        matterId: matter.id,
        reference: matter.reference,
        title: matter.title,
        type: matter.type,
        client: client.name,
        status: matter.status,
        lawyer: matter.lawyerId ? '(asignado)' : '(sin asignar)',
      });
    } catch (e) {
      const msg = (e as Error).message || 'Error desconocido';
      if (msg.includes('referenceExists')) {
        return json({
          created: false,
          note: `La referencia ya existe. Omítela para generar automáticamente.`,
        });
      }
      return json({ created: false, note: `No se pudo crear: ${msg}` });
    }
  }

  private async applyPresentationToMatter(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const presentationTypeName = str(input, 'presentationTypeName');

    if (!matterReference) {
      return json({ error: 'Falta la referencia del expediente.' });
    }
    if (!presentationTypeName) {
      return json({ error: 'Falta el nombre del tipo de presentación a aplicar.' });
    }

    // Resuelve el expediente por referencia (acotado por tenant)
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        applied: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha aplicado el checklist.`,
      });
    }

    // Busca el tipo de presentación por nombre (acotado por tenant)
    const presentationType = await this.prisma.presentationType.findFirst({
      where: { tenantId: user.tenantId, name: presentationTypeName },
      select: { id: true, name: true },
    });
    if (!presentationType) {
      return json({
        applied: false,
        note: `No existe tipo de presentación "${presentationTypeName}" en el despacho; lista los tipos disponibles.`,
      });
    }

    // Delega al servicio (que maneja la creación de checklist, ítems y tareas)
    const checklist = await this.presentations.applyToMatter(user, matter.id, presentationType.id);

    return json({
      applied: true,
      checklistId: checklist.id,
      matterReference: matter.reference,
      presentationType: presentationType.name,
      itemsCount: checklist.items.length,
      note: `Checklist instanciado con ${checklist.items.length} requisito(s); se han creado también las tareas asociadas.`,
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

/** Resumen legible (para confirmación) de una acción de escritura propuesta por el agente. */
function describeWrite(inv: AiToolInvocation): string {
  const title = str(inv.input, 'title') ?? '';
  const ref = str(inv.input, 'matterReference');
  if (inv.name === 'create_task') {
    return `Crear la tarea "${title}"${ref ? ` en el expediente ${ref}` : ''}`;
  }
  if (inv.name === 'draft_and_save_document') {
    return `Redactar y guardar el documento "${title}" en ${ref ?? 'el expediente'} (borrador)`;
  }
  if (inv.name === 'create_template') {
    return `Crear la plantilla "${str(inv.input, 'name') ?? ''}" en la biblioteca`;
  }
  if (inv.name === 'create_client') {
    const taxId = str(inv.input, 'taxId');
    return `Dar de alta el cliente "${str(inv.input, 'name') ?? ''}"${taxId ? ` (${taxId})` : ''}`;
  }
  if (inv.name === 'create_matter') {
    const type = str(inv.input, 'type');
    return `Abrir el expediente "${title}"${type ? ` (${type})` : ''}`;
  }
  if (inv.name === 'apply_presentation_to_matter') {
    return `Aplicar el checklist de presentación a ${ref ?? 'el expediente'} (creará tareas/plazos)`;
  }
  return inv.name;
}
