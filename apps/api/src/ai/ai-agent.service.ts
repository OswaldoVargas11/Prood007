import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  AI_ENGINE,
  ClosingItemCategory,
  ClosingItemPhase,
  Jurisdiction,
  MatterStatus,
  Role,
  TaskStatus,
  searchFeatureGuide,
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
import { ClausesService } from '../clauses/clauses.service';
import { ClosingService } from '../closing/closing.service';
import { AiSearchService } from './ai-search.service';
import { AGENT_SYSTEM_PROMPT, selectAgentTools } from './ai-agent.tools';
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
  | { type: 'tool_result'; tool: string; result: string; isError: boolean }
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
  'update_task_status',
  'extend_task_deadline',
  'create_client_portal_user',
  'add_matter_team_member',
  'create_procedural_task',
  'generate_document_package',
  'add_closing_item',
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
    private readonly clauses: ClausesService,
    private readonly closing: ClosingService,
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
      (tool, result, isError) => opts.onEvent({ type: 'tool_result', tool, result, isError }),
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
    onToolResult?: (name: string, content: string, isError: boolean) => void,
  ): Promise<AiAgentResponse> {
    await this.quota.consume(user);

    // HITL: salvo confirmación explícita del cliente, las herramientas de escritura NO se ejecutan; se
    // proponen y se recogen aquí para que la UI pida confirmación antes de actuar.
    const pendingWrites: PendingWrite[] = [];
    const exec: AiToolExecutor = async (invocation) => {
      if (isAborted?.()) {
        return { content: 'Operación cancelada por el usuario.', isError: true };
      }
      onTool?.(invocation.name);
      const outcome = await this.execute(user, invocation, allowWrites, pendingWrites);
      // Emite el RESULTADO de la herramienta para que la UI lo pinte como tarjeta (Generative UI).
      onToolResult?.(invocation.name, outcome.content, Boolean(outcome.isError));
      return outcome;
    };

    let result;
    try {
      result = await this.engine.runAgent(
        {
          system: AGENT_SYSTEM_PROMPT,
          userMessage: message,
          history: history.slice(-MAX_HISTORY_MESSAGES),
          // Exposición diferida: solo las tools relevantes al turno (el executor maneja todas igualmente).
          tools: selectAgentTools(
            message,
            history.slice(-MAX_HISTORY_MESSAGES).map((m) => m.content),
          ),
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
        case 'how_to':
          return { content: this.howTo(inv.input) };
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
        case 'get_task_detail':
          return { content: await this.getTaskDetail(user, inv.input) };
        case 'list_templates':
          return { content: await this.listTemplates(user) };
        case 'list_clauses':
          return { content: await this.listClauses(user) };
        case 'list_stale_matters_report':
          return { content: await this.listStaleMatterReport(user, inv.input) };
        case 'get_closing_checklists':
          return { content: await this.getClosingChecklists(user, inv.input) };
        case 'update_task_status':
          return { content: await this.updateTaskStatus(user, inv.input) };
        case 'extend_task_deadline':
          return { content: await this.extendTaskDeadline(user, inv.input) };
        case 'list_assignable_lawyers':
          return { content: await this.listAssignableLawyers(user) };
        case 'create_client_portal_user':
          return { content: await this.createClientPortalUser(user, inv.input) };
        case 'add_matter_team_member':
          return { content: await this.addMatterTeamMember(user, inv.input) };
        case 'preview_task_from_deadline':
          return { content: await this.previewTaskFromDeadline(user, inv.input) };
        case 'create_procedural_task':
          return { content: await this.createProceduralTask(user, inv.input) };
        case 'generate_document_package':
          return { content: await this.generateDocumentPackage(user, inv.input) };
        case 'compare_document_versions':
          return { content: await this.compareDocumentVersions(user, inv.input) };
        case 'list_document_versions':
          return { content: await this.listDocumentVersions(user, inv.input) };
        case 'list_presentation_types':
          return { content: await this.listPresentationTypes(user) };
        case 'get_presentation_type':
          return { content: await this.getPresentationType(user, inv.input) };
        case 'list_matter_checklists':
          return { content: await this.listMatterChecklists(user, inv.input) };
        case 'export_checklist_pdf':
          return { content: await this.exportChecklistPdf(user, inv.input) };
        case 'add_closing_item':
          return { content: await this.addClosingItem(user, inv.input) };
        case 'generate_closing_binder':
          return { content: await this.generateClosingBinder(user, inv.input) };
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

  /** Guía de uso: dónde está una opción en el menú y los pasos. No toca BD (lee la guía de funciones). */
  private howTo(input: Record<string, unknown>): string {
    const hits = searchFeatureGuide(str(input, 'query') ?? '', 5);
    return json({
      results: hits.map((e) => ({
        funcion: e.title,
        donde: `${e.group} › ${e.menu}`,
        ruta: e.route,
        para_que: e.what,
        pasos: e.steps,
        soloAdmin: e.adminOnly ?? false,
      })),
      nota: 'Guía al usuario por estos pasos en la interfaz. Si además quiere que lo hagas tú, usa la herramienta de acción.',
    });
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

  private async getTaskDetail(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const taskId = str(input, 'taskId');
    if (!taskId) return json({ error: 'Falta el ID de la tarea.' });

    try {
      const task = await this.tasks.findOne(user, taskId);

      // Enriquecemos con la referencia del expediente si existe.
      let matterRef: string | null = null;
      if (task.matterId) {
        const matter = await this.prisma.matter.findUnique({
          where: { id: task.matterId },
          select: { reference: true },
        });
        matterRef = matter?.reference ?? null;
      }

      // Obtenemos el nombre del responsable si está asignada.
      let assigneeName: string | null = null;
      if (task.assigneeId) {
        const assignee = await this.prisma.user.findUnique({
          where: { id: task.assigneeId },
          select: { fullName: true },
        });
        assigneeName = assignee?.fullName ?? null;
      }

      return json({
        found: true,
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        status: task.status,
        dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
        matter: matterRef,
        assignee: assigneeName,
        isProcedural: task.isProcedural,
        deadlineType: task.deadlineType ?? null,
        notificationRef: task.notificationRef ?? null,
        notifiedAt: task.notifiedAt ? task.notifiedAt.toISOString().slice(0, 10) : null,
        createdAt: task.createdAt.toISOString().slice(0, 10),
        updatedAt: task.updatedAt.toISOString().slice(0, 10),
      });
    } catch (e) {
      if ((e as any).code === 'P2025' || (e as Error).message?.includes('notFound')) {
        return json({ found: false, error: `No existe tarea con ID ${taskId}.` });
      }
      throw e;
    }
  }

  private async listTemplates(user: RequestUser): Promise<string> {
    const templates = await this.templates.list(user);
    if (templates.length === 0)
      return json({ count: 0, templates: [], note: 'No hay plantillas en la biblioteca.' });
    return json({
      count: templates.length,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? null,
        tokens: t.tokens ?? [],
      })),
    });
  }

  private async listClauses(_user: RequestUser): Promise<string> {
    // ClausesService.list() está acotado por RLS (igual que su controlador); el contexto de tenant de
    // la petición del agente aplica las mismas políticas.
    const clauses = await this.clauses.list();
    if (clauses.length === 0) {
      return json({ count: 0, clauses: [], note: 'Sin cláusulas en la biblioteca del despacho.' });
    }
    return json({
      count: clauses.length,
      clauses: clauses.map((c) => ({
        id: c.id,
        name: c.name,
        body: c.body.slice(0, 500), // limita a 500 caracteres en el resumen
      })),
    });
  }

  private async listStaleMatterReport(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    // Validación de entrada
    const staleDaysParam = int(input, 'staleDays', 30, 365);
    const limit = int(input, 'limit', 20, 50);

    // Usar staleDays del ENV si está configurado, sino el parámetro
    const staleDays = Number(process.env.PRODUCTIVITY_STALE_DAYS ?? staleDaysParam);
    const cutoff = new Date(Date.now() - staleDays * 86_400_000);

    // Traer expedientes activos con abogado asignado
    const matters = await this.prisma.matter.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: ACTIVE_MATTER_STATUSES },
        lawyerId: { not: null },
      },
      select: {
        id: true,
        reference: true,
        title: true,
        lawyerId: true,
        createdAt: true,
        updatedAt: true,
        lawyer: { select: { fullName: true } },
      },
    });

    if (matters.length === 0) {
      return json({ count: 0, staleDays, matters: [], note: 'Sin expedientes activos.' });
    }

    const ids = matters.map((m) => m.id);

    // Traer máximos de actividad (tiempo + ledger)
    const [timeAgg, ledgerAgg] = await Promise.all([
      this.prisma.timeEntry.groupBy({
        by: ['matterId'],
        where: { tenantId: user.tenantId, matterId: { in: ids } },
        _max: { workedAt: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['matterId'],
        where: { tenantId: user.tenantId, matterId: { in: ids } },
        _max: { createdAt: true },
      }),
    ]);

    const timeMax = new Map(timeAgg.map((r) => [r.matterId, r._max.workedAt]));
    const ledgerMax = new Map(ledgerAgg.map((r) => [r.matterId, r._max.createdAt]));

    // Clasificar expedientes dormidos
    const byLawyer = new Map<
      string,
      {
        lawyer: string;
        matters: Array<{
          reference: string;
          title: string;
          lastActivity: string;
          daysInactive: number;
        }>;
      }
    >();

    for (const m of matters) {
      const candidates = [m.updatedAt, timeMax.get(m.id), ledgerMax.get(m.id)].filter(
        (d): d is Date => d instanceof Date,
      );
      const lastActivity = candidates.reduce((a, b) => (a > b ? a : b), m.createdAt);

      if (lastActivity < cutoff && m.lawyerId) {
        const daysInactive = Math.floor((Date.now() - lastActivity.getTime()) / 86_400_000);
        const group = byLawyer.get(m.lawyerId) ?? {
          lawyer: m.lawyer?.fullName ?? '(Sin asignar)',
          matters: [],
        };

        group.matters.push({
          reference: m.reference,
          title: m.title,
          lastActivity: lastActivity.toISOString().slice(0, 10),
          daysInactive,
        });

        byLawyer.set(m.lawyerId, group);
      }
    }

    // Agrupar y devolver
    const report = [...byLawyer.values()]
      .map((g) => ({
        lawyer: g.lawyer,
        count: g.matters.length,
        matters: g.matters.sort((a, b) => b.daysInactive - a.daysInactive).slice(0, limit),
      }))
      .sort((a, b) => b.count - a.count);

    const totalStale = report.reduce((s, g) => s + g.count, 0);

    return json({
      count: totalStale,
      staleDays,
      reportDate: new Date().toISOString().slice(0, 10),
      byLawyer: report,
      note: totalStale === 0 ? 'Todos los expedientes tienen actividad reciente.' : undefined,
    });
  }

  private async getClosingChecklists(
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

    const checklists = await this.closing.listByMatter(user, matter.id);
    if (checklists.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        checklists: [],
        note: 'No hay checklists de cierre en este expediente.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      count: checklists.length,
      checklists: checklists.map((c) => ({
        id: c.id,
        title: c.title,
        progress: `${c.satisfied}/${c.total}`,
        satisfied: c.satisfied,
        total: c.total,
        signingDate: c.signingDate ? c.signingDate.toISOString().slice(0, 10) : null,
        closingDate: c.closingDate ? c.closingDate.toISOString().slice(0, 10) : null,
        longstopDate: c.longstopDate ? c.longstopDate.toISOString().slice(0, 10) : null,
        createdAt: c.createdAt ? c.createdAt.toISOString().slice(0, 10) : null,
      })),
    });
  }

  private async updateTaskStatus(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const taskId = str(input, 'taskId');
    if (!taskId) {
      return json({ error: 'El ID de la tarea es obligatorio.' });
    }
    const status = str(input, 'status');
    if (!status || !['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'].includes(status)) {
      return json({
        error: 'Estado no válido. Usa: TODO, IN_PROGRESS, DONE o CANCELLED.',
      });
    }

    const title = str(input, 'title');
    if (title && title.length < 2) {
      return json({ error: 'El título debe tener al menos 2 caracteres.' });
    }

    const description = str(input, 'description');
    if (description && description.length > 2000) {
      return json({ error: 'La descripción no puede exceder 2000 caracteres.' });
    }

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

    try {
      const task = await this.tasks.update(user, taskId, {
        status: status as any, // TaskStatus enum: TODO | IN_PROGRESS | DONE | CANCELLED
        title: title ? title.slice(0, 200) : undefined,
        description,
        dueDate,
      });
      return json({
        updated: true,
        taskId: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
      });
    } catch (e) {
      // TasksService.update lanza NotFoundException si la tarea no existe o no es del tenant.
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `La tarea con ID ${taskId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async extendTaskDeadline(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const taskTitle = str(input, 'taskTitle');
    const newDueDateRaw = str(input, 'newDueDate');
    const reason = str(input, 'reason');

    if (!taskTitle) {
      return json({ error: 'Indica el título de la tarea a extender.' });
    }
    if (!newDueDateRaw) {
      return json({ error: 'Indica la nueva fecha de vencimiento en formato YYYY-MM-DD.' });
    }

    // Valida que la fecha sea válida
    const newDate = new Date(newDueDateRaw);
    if (Number.isNaN(newDate.getTime())) {
      return json({
        error: `Fecha de vencimiento no válida: ${newDueDateRaw}. Usa el formato YYYY-MM-DD.`,
      });
    }

    // Busca la tarea por título (dentro de las del tenant, búsqueda insensible)
    const task = await this.prisma.task.findFirst({
      where: {
        tenantId: user.tenantId,
        title: { contains: taskTitle, mode: 'insensitive' as const },
      },
      select: { id: true, title: true, dueDate: true },
    });

    if (!task) {
      return json({
        found: false,
        note: `No existe tarea con título similar a "${taskTitle}".`,
      });
    }

    // Actualiza la tarea vía TasksService (con auditoría y validaciones)
    const updated = await this.tasks.update(user, task.id, {
      dueDate: newDate.toISOString(),
    });

    // Log adicional de la razón si se proporciona
    if (reason) {
      await this.audit
        .log(user, 'task.deadline_extended', 'Task', task.id, {
          reason,
          oldDueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
          newDueDate: newDueDateRaw,
        })
        .catch(() => undefined);
    }

    return json({
      extended: true,
      taskId: updated.id,
      title: updated.title,
      oldDueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
      newDueDate: updated.dueDate ? updated.dueDate.toISOString().slice(0, 10) : null,
    });
  }

  private async listAssignableLawyers(user: RequestUser): Promise<string> {
    // Valida FIRM_ADMIN
    if (!user.roles.includes(Role.FIRM_ADMIN)) {
      return json({
        error: 'Solo administradores del despacho pueden listar letrados asignables.',
      });
    }

    const lawyers = await this.matters.listAssignees(user);
    if (lawyers.length === 0) {
      return json({ count: 0, lawyers: [], note: 'No hay letrados asignables en el despacho.' });
    }
    return json({
      count: lawyers.length,
      lawyers: lawyers.map((l) => ({ id: l.id, name: l.fullName })),
    });
  }

  private async createClientPortalUser(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) {
      return json({ error: 'El ID del cliente es obligatorio.' });
    }

    const email = str(input, 'email');
    if (!email) {
      return json({ error: 'El correo electrónico es obligatorio.' });
    }
    if (!email.includes('@')) {
      return json({ error: 'El correo debe ser válido.' });
    }

    const password = str(input, 'password');
    if (!password || password.length < 10) {
      return json({
        error: 'La contraseña es obligatoria y debe tener al menos 10 caracteres.',
      });
    }

    const fullName = str(input, 'fullName');
    if (!fullName || fullName.length < 2) {
      return json({
        error: 'El nombre completo es obligatorio (mínimo 2 caracteres).',
      });
    }

    try {
      const result = await this.clients.createPortalUser(user, clientId, {
        email,
        password,
        fullName,
      });
      return json({
        created: true,
        userId: result.userId,
        email: result.email,
        message:
          'Acceso de portal creado exitosamente. Se ha enviado una invitación al cliente para fijar su contraseña.',
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('Not found')) {
        return json({
          created: false,
          error: `El cliente con ID ${clientId} no existe o no es accesible en tu despacho.`,
        });
      }
      if (msg.includes('Conflict') || msg.includes('already')) {
        return json({
          created: false,
          error: 'El cliente ya tiene acceso de portal o el correo está registrado en el despacho.',
        });
      }
      return json({
        created: false,
        error: msg,
      });
    }
  }

  private async addMatterTeamMember(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const lawyerName = str(input, 'lawyerName');

    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });
    if (!lawyerName || lawyerName.length < 2) {
      return json({ error: 'Indica el nombre del letrado (mínimo 2 caracteres).' });
    }

    // Resuelve el expediente por referencia (acotado por tenant)
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        added: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    }

    // Busca el letrado por nombre (búsqueda insensible, activos con rol LAWYER o FIRM_ADMIN)
    const lawyer = await this.prisma.user.findFirst({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        fullName: { contains: lawyerName, mode: 'insensitive' as const },
        roles: { some: { role: { code: { in: [Role.LAWYER, Role.FIRM_ADMIN] } } } },
      },
      select: { id: true, fullName: true },
    });
    if (!lawyer) {
      return json({
        added: false,
        note: `Letrado no encontrado con nombre similar a "${lawyerName}" o sin permisos de LAWYER/ADMIN.`,
      });
    }

    // Añade el letrado al equipo vía MattersService.addAssignee (idempotente via upsert)
    const team = await this.matters.addAssignee(user, matter.id, lawyer.id);

    return json({
      added: true,
      matterReference: matter.reference,
      lawyer: lawyer.fullName,
      lead: team.lead ? team.lead.fullName : '(sin asignar)',
      members: team.members.map((m) => m.fullName),
      note: `Letrado "${lawyer.fullName}" añadido al equipo del expediente.`,
    });
  }

  private async previewTaskFromDeadline(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const deadlineType = str(input, 'deadlineType');
    if (!deadlineType || deadlineType.trim().length === 0) {
      return json({ error: 'El tipo de plazo (deadlineType) es obligatorio.' });
    }

    const startDate = str(input, 'startDate');
    if (!startDate) {
      return json({
        error: 'La fecha de inicio (startDate) es obligatoria en formato YYYY-MM-DD.',
      });
    }

    // Valida que la fecha sea válida
    const d = new Date(startDate);
    if (Number.isNaN(d.getTime())) {
      return json({
        error: `Fecha de inicio no válida: ${startDate}. Usa el formato YYYY-MM-DD.`,
      });
    }

    const days = int(input, 'days', 1, 999);
    if (days < 1) {
      return json({ error: 'El número de días debe ser positivo (mínimo 1).' });
    }

    try {
      const deadline = await this.tasks.previewDeadline(user, {
        deadlineType,
        startDate,
        days,
      });

      return json({
        computed: true,
        dueDate: deadline.dueDate,
        startDate,
        days,
        deadlineType,
        holidaysApplied: deadline.holidaysApplied ?? [],
        holidayCount: Array.isArray(deadline.holidaysApplied) ? deadline.holidaysApplied.length : 0,
        note: `Plazo vence el ${deadline.dueDate} (${Array.isArray(deadline.holidaysApplied) ? deadline.holidaysApplied.length : 0} festivo(s) aplicado(s)).`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      return json({
        error:
          msg.includes('deadlineType') || msg.includes('unknown')
            ? `Tipo de plazo no reconocido: "${deadlineType}". Consulta con el despacho los tipos válidos para la jurisdicción.`
            : msg,
        hint: 'Verifica que deadlineType sea válido y que startDate esté en YYYY-MM-DD.',
      });
    }
  }

  private async createProceduralTask(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const title = str(input, 'title');
    const deadlineType = str(input, 'deadlineType');
    const startDate = str(input, 'startDate');
    const days = int(input, 'days', 1, 365);
    const matterId = str(input, 'matterId');
    const assigneeId = str(input, 'assigneeId');
    const notificationRef = str(input, 'notificationRef');

    // Validaciones obligatorias
    if (!deadlineType || deadlineType.length < 2) {
      return json({ error: 'deadlineType obligatorio (mínimo 2 caracteres).' });
    }
    if (!startDate) {
      return json({ error: 'startDate obligatoria en formato YYYY-MM-DD.' });
    }
    const startD = new Date(startDate);
    if (Number.isNaN(startD.getTime())) {
      return json({
        error: `startDate no válida: ${startDate}. Usa el formato YYYY-MM-DD.`,
      });
    }
    if (days < 1 || days > 365) {
      return json({ error: 'days debe estar entre 1 y 365.' });
    }

    // Validar matterId si se proporciona
    if (matterId) {
      const matter = await this.prisma.matter.findFirst({
        where: { tenantId: user.tenantId, id: matterId },
        select: { id: true, reference: true },
      });
      if (!matter) {
        return json({
          created: false,
          note: `No existe expediente con ID ${matterId} en tu despacho.`,
        });
      }
    }

    // Validar assigneeId si se proporciona
    if (assigneeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { tenantId: user.tenantId, id: assigneeId },
        select: { id: true },
      });
      if (!assignee) {
        return json({
          created: false,
          note: `No existe usuario con ID ${assigneeId} en tu despacho.`,
        });
      }
    }

    try {
      // Delega a TasksService.createFromDeadline (que calcula el plazo procesal)
      const { task, deadline } = await this.tasks.createFromDeadline(user, {
        title: title ? title.slice(0, 200) : undefined,
        deadlineType: deadlineType.slice(0, 80),
        startDate: startDate,
        days,
        matterId,
        assigneeId,
        notificationRef: notificationRef ? notificationRef.slice(0, 120) : undefined,
      });

      return json({
        created: true,
        taskId: task.id,
        title: task.title,
        deadlineType: task.deadlineType,
        isProcedural: task.isProcedural,
        dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
        startDate,
        days,
        holidaysApplied: deadline.holidaysApplied,
        matterId: matterId ?? null,
        notificationRef: task.notificationRef ?? null,
        message: `Plazo procesal creado: ${task.title} vence el ${task.dueDate?.toISOString().slice(0, 10)} (${deadline.holidaysApplied} días hábiles + festivos).`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      return json({ created: false, error: msg });
    }
  }

  private async generateDocumentPackage(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const templateNames = Array.isArray(input.templateNames)
      ? input.templateNames.filter((t) => typeof t === 'string')
      : [];

    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });
    if (!templateNames || templateNames.length === 0) {
      return json({ error: 'Indica al menos una plantilla para ensamblar.' });
    }

    // Resuelve el expediente por referencia (acotado por tenant)
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        assembled: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha ensamblado el paquete.`,
      });
    }

    // Resuelve los nombres de plantilla a sus IDs (acotado por tenant)
    const templates = await this.prisma.documentTemplate.findMany({
      where: {
        tenantId: user.tenantId,
        name: { in: templateNames },
      },
      select: { id: true, name: true },
    });

    if (templates.length === 0) {
      return json({
        assembled: false,
        note: `Ninguna de las plantillas indicadas existe en el despacho. Verifica los nombres: ${templateNames.join(', ')}.`,
      });
    }

    const missing = templateNames.filter((t) => !templates.some((tpl) => tpl.name === t));

    // Delega al servicio (acotado por tenant, reutiliza generateFromTemplate por cada una)
    const templateIds = templates.map((t) => t.id);
    const result = await this.documents.generateFromTemplates(user, matter.id, templateIds);

    return json({
      assembled: true,
      matterReference: matter.reference,
      templatesRequested: templateNames.length,
      templatesFound: templates.length,
      missing: missing.length > 0 ? missing : null,
      count: result.count,
      documents: result.documents.map((d) => ({
        id: d.id,
        name: d.name,
      })),
      note:
        result.count > 0
          ? `Paquete ensamblado: ${result.count} documento(s) creado(s).`
          : 'No se creó ningún documento.',
    });
  }

  private async compareDocumentVersions(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const documentId = str(input, 'documentId');
    const baseVersionId = str(input, 'baseVersionId');
    const againstVersionId = str(input, 'againstVersionId');

    if (!documentId) return json({ error: 'Falta el ID del documento.' });
    if (!baseVersionId) return json({ error: 'Falta el ID de la versión BASE.' });
    if (!againstVersionId) return json({ error: 'Falta el ID de la versión a comparar.' });

    if (baseVersionId === againstVersionId) {
      return json({ error: 'Las versiones BASE y NUEVA no pueden ser la misma.' });
    }

    try {
      const result = await this.documents.compare(
        user,
        documentId,
        baseVersionId,
        againstVersionId,
      );
      return json({
        found: true,
        documentId,
        baseVersion: result.baseVersion,
        againstVersion: result.againstVersion,
        extractable: result.extractable,
        segments: result.extractable
          ? result.segments.map((s) => ({
              type: s.type,
              value: s.value,
            }))
          : [],
        statistics: {
          wordsAdded: result.added,
          wordsRemoved: result.removed,
        },
        note: result.extractable
          ? `Comparación completada: ${result.added} palabra(s) añadida(s), ${result.removed} eliminada(s).`
          : 'Las versiones no tienen contenido de texto extraíble; el redline no está disponible.',
      });
    } catch (e) {
      if ((e as any).code === 'P2025' || (e as Error).message?.includes('notFound')) {
        return json({
          found: false,
          error: 'No existe el documento o alguna de las versiones indicadas.',
        });
      }
      const msg = (e as Error).message || 'Error desconocido';
      if (msg.includes('Misma')) {
        return json({
          error: 'Las versiones BASE y NUEVA no pueden ser idénticas.',
        });
      }
      throw e;
    }
  }

  private async listDocumentVersions(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const documentId = str(input, 'documentId');
    if (!documentId) return json({ error: 'Falta el ID del documento.' });

    const document = await this.documents.getOne(user, documentId);

    if (!document.versions || document.versions.length === 0) {
      return json({
        found: true,
        documentId: document.id,
        documentName: document.name,
        count: 0,
        versions: [],
        note: 'Sin historial de versiones.',
      });
    }

    return json({
      found: true,
      documentId: document.id,
      documentName: document.name,
      count: document.versions.length,
      versions: document.versions.map((v) => ({
        version: v.version,
        id: v.id,
        uploadedAt: v.createdAt ? v.createdAt.toISOString().slice(0, 10) : null,
        uploadedBy: v.uploadedBy?.fullName ?? '(Sin autor)',
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        reviewStatus: v.reviewStatus,
        reviewCount: v.reviews?.length ?? 0,
      })),
    });
  }

  private async listPresentationTypes(user: RequestUser): Promise<string> {
    const types = await this.presentations.listTypes(user);
    if (types.length === 0) {
      return json({ count: 0, types: [], note: 'No hay tipos de presentación configurados.' });
    }
    return json({
      count: types.length,
      types: types.map((t) => ({
        id: t.id,
        name: t.name,
        sector: t.sector,
        jurisdiction: t.jurisdiction ?? null,
        description: t.description ?? null,
        requirementsCount: t.requirements.length,
        requirements: t.requirements.map((r) => ({
          name: r.name,
          description: r.description ?? null,
          required: r.required,
          order: r.order,
        })),
        taskTemplatesCount: t.taskTemplates.length,
        taskTemplates: t.taskTemplates.map((tt) => ({
          title: tt.title,
          offsetDays: tt.offsetDays,
          order: tt.order,
        })),
        usageCount: t._count.checklists,
      })),
    });
  }

  private async getPresentationType(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const presentationTypeId = str(input, 'presentationTypeId');
    if (!presentationTypeId) return json({ error: 'Falta el ID del tipo de presentación.' });

    try {
      const type = await this.presentations.getType(user, presentationTypeId);
      return json({
        found: true,
        id: type.id,
        name: type.name,
        sector: type.sector,
        description: type.description ?? null,
        jurisdiction: type.jurisdiction ?? null,
        requirements: type.requirements.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description ?? null,
          required: r.required,
          order: r.order,
        })),
        taskTemplates: type.taskTemplates.map((tt) => ({
          id: tt.id,
          title: tt.title,
          offsetDays: tt.offsetDays,
          order: tt.order,
        })),
        requirementCount: type.requirements.length,
        taskTemplateCount: type.taskTemplates.length,
      });
    } catch (e) {
      if ((e as any).code === 'P2025' || (e as Error).message?.includes('notFound')) {
        return json({
          found: false,
          error: `No existe tipo de presentación con ID ${presentationTypeId}.`,
        });
      }
      throw e;
    }
  }

  private async listMatterChecklists(
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
    const checklists = await this.presentations.listForMatter(user, matter.id);
    if (checklists.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        checklists: [],
        note: 'No hay checklists de presentación en este expediente.',
      });
    }
    return json({
      found: true,
      matter: matterReference,
      count: checklists.length,
      checklists: checklists.map((c) => ({
        id: c.id,
        title: c.title,
        progress: `${c.progress.done}/${c.progress.total}`,
        progressPercent: c.progress.percent,
        itemsCount: c.items.length,
        createdAt: c.createdAt ? c.createdAt.toISOString().slice(0, 10) : null,
      })),
    });
  }

  private async exportChecklistPdf(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const checklistId = str(input, 'checklistId');
    if (!checklistId) {
      return json({ error: 'Falta el ID de la checklist.' });
    }

    try {
      const result = await this.presentations.checklistPdf(user, checklistId);
      return json({
        success: true,
        filename: result.filename,
        mimeType: 'application/pdf',
        sizeBytes: result.buffer.length,
        note: `PDF de checklist generado y listo para descargar: ${result.filename}`,
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `La checklist con ID ${checklistId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async addClosingItem(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const checklistId = str(input, 'checklistId');
    if (!checklistId) {
      return json({ error: 'El ID del checklist es obligatorio.' });
    }

    const category = str(input, 'category') as
      | 'CONDITION_PRECEDENT'
      | 'DELIVERABLE'
      | 'SIGNATURE_PAGE'
      | 'OTHER'
      | undefined;
    if (
      !category ||
      !['CONDITION_PRECEDENT', 'DELIVERABLE', 'SIGNATURE_PAGE', 'OTHER'].includes(category)
    ) {
      return json({
        error:
          'Categoría no válida. Elige una de: CONDITION_PRECEDENT, DELIVERABLE, SIGNATURE_PAGE, OTHER.',
      });
    }

    const title = str(input, 'title');
    if (!title || title.length < 2) {
      return json({ error: 'El título del ítem es obligatorio (mínimo 2 caracteres).' });
    }

    const phaseRaw = str(input, 'phase');
    const phase = (Object.values(ClosingItemPhase) as string[]).includes(phaseRaw ?? '')
      ? (phaseRaw as ClosingItemPhase)
      : undefined;
    const responsibleParty = str(input, 'responsibleParty');
    const assigneeId = str(input, 'assigneeId');
    const documentId = str(input, 'documentId');
    const detail = str(input, 'detail');
    const inEscrow = typeof input.inEscrow === 'boolean' ? input.inEscrow : false;

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

    try {
      const checklist = await this.closing.addItem(user, checklistId, {
        category: category as ClosingItemCategory,
        phase,
        title: title.slice(0, 200),
        detail: detail ? detail.slice(0, 1000) : undefined,
        responsibleParty,
        assigneeId,
        documentId,
        dueDate,
        inEscrow,
      });

      return json({
        added: true,
        checklistId: checklist.id,
        itemCount: checklist.items.length,
        title: title,
        category,
        phase: phase ?? null,
        responsibleParty: responsibleParty ?? null,
        dueDate: dueDate ? dueDate.slice(0, 10) : null,
        inEscrow,
        note: `Ítem añadido al checklist. Total de partidas: ${checklist.items.length}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('checklistNotFound')) {
        return json({
          added: false,
          error: `No existe checklist con ID ${checklistId} en tu despacho.`,
        });
      }
      if (msg.includes('notInFirm') || msg.includes('assigneeNotInFirm')) {
        return json({
          added: false,
          error: 'El asignado o documento no pertenece a tu despacho.',
        });
      }
      return json({
        added: false,
        error: `No se pudo añadir el ítem: ${msg}`,
      });
    }
  }

  private async generateClosingBinder(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const checklistId = str(input, 'checklistId');
    if (!checklistId) {
      return json({ error: 'El ID del checklist es obligatorio.' });
    }

    try {
      const { filename, buffer } = await this.closing.buildBinder(user, checklistId);
      return json({
        generated: true,
        filename,
        sizeBytes: buffer.length,
        note: `Closing binder generado exitosamente. ${buffer.length > 0 ? `Tamaño: ${(buffer.length / 1024).toFixed(1)} KB.` : 'El ZIP no contiene documentos.'}`,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('notFound')) {
        return json({
          generated: false,
          error: 'El checklist no existe o no pertenece a tu despacho.',
        });
      }
      throw e;
    }
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
  if (inv.name === 'update_task_status') {
    return `Cambiar el estado de la tarea a "${str(inv.input, 'status') ?? ''}"`;
  }
  if (inv.name === 'extend_task_deadline') {
    return `Aplazar el vencimiento de la tarea a ${str(inv.input, 'dueDate') ?? '(nueva fecha)'}`;
  }
  if (inv.name === 'create_client_portal_user')
    return 'Crear un acceso de portal para el cliente (enviará invitación por correo)';
  if (inv.name === 'add_matter_team_member')
    return `Añadir un letrado al equipo del expediente ${ref ?? ''}`;
  if (inv.name === 'create_procedural_task')
    return `Crear un plazo procesal calculado${ref ? ` en ${ref}` : ''}`;
  if (inv.name === 'generate_document_package')
    return `Generar un paquete de documentos${ref ? ` en ${ref}` : ''}`;
  if (inv.name === 'add_closing_item') return 'Añadir una partida al checklist de cierre';
  return inv.name;
}
