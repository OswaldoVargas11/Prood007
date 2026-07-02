import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  AI_ENGINE,
  ClosingItemCategory,
  ClosingItemPhase,
  ClosingItemStatus,
  FolderKind,
  Jurisdiction,
  LeadStatus,
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
import { LeadsService } from '../leads/leads.service';
import { KycService } from '../kyc/kyc.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { SavedViewsService } from '../saved-views/saved-views.service';
import { EmailSnippetsService } from '../email-snippets/email-snippets.service';
import { DataRoomService } from '../data-room/data-room.service';
import { DealService } from '../deal/deal.service';
import { EngagementService } from '../engagement/engagement.service';
import { CompanySecretaryService } from '../company-secretary/company-secretary.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentPackagesService } from '../document-packages/document-packages.service';
import { FoldersService } from '../folders/folders.service';
import { AiSearchService } from './ai-search.service';
import { AiPlaybookService } from './ai-playbook.service';
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS, selectAgentTools } from './ai-agent.tools';
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
  'create_presentation_type',
  'update_task_status',
  'extend_task_deadline',
  'create_client_portal_user',
  'add_matter_team_member',
  'create_procedural_task',
  'generate_document_package',
  'add_closing_item',
  'convert_lead_to_client',
  'update_lead',
  'upsert_client_kyc',
  'confirm_appointment',
  'cancel_appointment',
  'create_data_room_grant',
  'answer_data_room_question',
  'add_transaction_party',
  'update_transaction_party',
  'add_transaction_milestone',
  'update_transaction_milestone',
  'update_disclosure_schedule',
  'update_registry_filing',
  'save_engagement_letter',
  'add_shareholder',
  'add_firm_holiday',
  'change_matter_status',
  'update_client_info',
  'create_lead',
  'reassign_task',
  'create_saved_view',
  'create_document_folder',
  'update_checklist_item',
  'link_document_to_data_room',
  'add_data_room_group',
  'revoke_data_room_grant',
  'add_disclosure_schedule',
  'add_corporate_minute',
  'assign_matter_lawyer',
  'create_closing_checklist',
  'update_closing_item',
  'create_data_room',
  'add_data_room_folder',
  'add_registry_filing',
  'add_share_transfer',
  'add_registry_obligation',
  'update_registry_obligation',
  'run_playbook_review',
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
    private readonly leads: LeadsService,
    private readonly kyc: KycService,
    private readonly scheduling: SchedulingService,
    private readonly savedViews: SavedViewsService,
    private readonly emailSnippets: EmailSnippetsService,
    private readonly dataRoom: DataRoomService,
    private readonly deal: DealService,
    private readonly engagement: EngagementService,
    private readonly companySecretary: CompanySecretaryService,
    private readonly settings: SettingsService,
    private readonly documentPackages: DocumentPackagesService,
    private readonly folders: FoldersService,
    private readonly search: AiSearchService,
    private readonly playbookReviews: AiPlaybookService,
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
   * executor corta en cuanto se aborta, sin ejecutar más herramientas. `signal` (cuando el controlador lo
   * propaga al cerrarse la conexión) corta ADEMÁS la generación en vuelo del proveedor: deja de gastar
   * tokens en el acto, no solo entre pasos.
   */
  async runStream(
    user: RequestUser,
    message: string,
    history: AiMessage[] = [],
    allowWrites = false,
    opts: {
      onEvent: (e: AgentStreamEvent) => void;
      isAborted: () => boolean;
      signal?: AbortSignal;
    } = {
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
      opts.signal,
    );
    opts.onEvent({ type: 'done', ...res });
  }

  // ── Ejecución directa de herramientas (motor de workflows, LAW-22) ─────────────────────────────────
  // El constructor de flujos multi-paso (AiWorkflowService) invoca herramientas del catálogo POR NOMBRE,
  // sin pasar por el modelo. Para no duplicar el dispatch ni el gate HITL, reutiliza el mismo `execute`
  // privado: así hay una ÚNICA fuente de verdad para "qué hace cada tool" y "qué requiere confirmación".

  /** ¿Esta herramienta MUTA estado (requiere confirmación HITL salvo allowWrites)? */
  isWriteTool(name: string): boolean {
    return WRITE_TOOLS.has(name);
  }

  /** Catálogo de herramientas para el builder de workflows (nombre + descripción + si es de escritura). */
  toolCatalog(): { name: string; description: string; isWrite: boolean }[] {
    return AGENT_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      isWrite: WRITE_TOOLS.has(t.name),
    }));
  }

  /**
   * Ejecuta UNA herramienta del catálogo de forma directa (sin el modelo), respetando el gate HITL: si es
   * de escritura y `allowWrites` es falso, NO se ejecuta — se devuelve `requires_confirmation` y se recoge
   * en `pendingWrites`. Reutilizado por el motor de workflows; cada paso de un flujo es una invocación.
   */
  async executeTool(
    user: RequestUser,
    invocation: AiToolInvocation,
    allowWrites = false,
  ): Promise<{ outcome: AiToolOutcome; pendingWrites: PendingWrite[] }> {
    const pendingWrites: PendingWrite[] = [];
    const outcome = await this.execute(user, invocation, allowWrites, pendingWrites);
    return { outcome, pendingWrites };
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
    signal?: AbortSignal,
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
        onText || signal ? { onText, signal } : undefined,
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
        case 'create_presentation_type':
          return { content: await this.createPresentationType(user, inv.input) };
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
        case 'convert_lead_to_client':
          return { content: await this.convertLeadToClient(user, inv.input) };
        case 'update_lead':
          return { content: await this.updateLead(user, inv.input) };
        case 'get_client_kyc':
          return { content: await this.getClientKyc(user, inv.input) };
        case 'upsert_client_kyc':
          return { content: await this.upsertClientKyc(user, inv.input) };
        case 'list_appointments_for_lawyer':
          return { content: await this.listAppointmentsForLawyer(user) };
        case 'confirm_appointment':
          return { content: await this.confirmAppointment(user, inv.input) };
        case 'cancel_appointment':
          return { content: await this.cancelAppointment(user, inv.input) };
        case 'list_saved_views':
          return { content: await this.listSavedViews(user, inv.input) };
        case 'get_email_snippets':
          return { content: await this.getEmailSnippets(user) };
        case 'list_data_rooms':
          return { content: await this.listDataRooms(user, inv.input) };
        case 'create_data_room_grant':
          return { content: await this.createDataRoomGrant(user, inv.input) };
        case 'answer_data_room_question':
          return { content: await this.answerDataRoomQuestion(user, inv.input) };
        case 'download_data_room_document_internal':
          return { content: await this.downloadDataRoomDocumentInternal(user, inv.input) };
        case 'add_transaction_party':
          return { content: await this.addTransactionParty(user, inv.input) };
        case 'update_transaction_party':
          return { content: await this.updateTransactionParty(user, inv.input) };
        case 'get_transaction_milestones':
          return { content: await this.getTransactionMilestones(user, inv.input) };
        case 'add_transaction_milestone':
          return { content: await this.addTransactionMilestone(user, inv.input) };
        case 'update_transaction_milestone':
          return { content: await this.updateTransactionMilestone(user, inv.input) };
        case 'update_disclosure_schedule':
          return { content: await this.updateDisclosureSchedule(user, inv.input) };
        case 'get_registry_filings':
          return { content: await this.getRegistryFilings(user, inv.input) };
        case 'update_registry_filing':
          return { content: await this.updateRegistryFiling(user, inv.input) };
        case 'get_engagement_letter':
          return { content: await this.getEngagementLetter(user, inv.input) };
        case 'save_engagement_letter':
          return { content: await this.saveEngagementLetter(user, inv.input) };
        case 'get_company_secretary_overview':
          return { content: await this.getCompanySecretaryOverview(user, inv.input) };
        case 'add_shareholder':
          return { content: await this.addShareholder(user, inv.input) };
        case 'get_firm_settings':
          return { content: await this.getFirmSettings(user) };
        case 'add_firm_holiday':
          return { content: await this.addFirmHoliday(user, inv.input) };
        case 'change_matter_status':
          return { content: await this.changeMattersStatus(user, inv.input) };
        case 'update_client_info':
          return { content: await this.updateClientInfo(user, inv.input) };
        case 'export_client_gdpr':
          return { content: await this.exportClientGdpr(user, inv.input) };
        case 'list_leads':
          return { content: await this.listLeads(user, inv.input) };
        case 'create_lead':
          return { content: await this.createLead(user, inv.input) };
        case 'get_matter_team':
          return { content: await this.getMatterTeam(user, inv.input) };
        case 'reassign_task':
          return { content: await this.reassignTask(user, inv.input) };
        case 'create_saved_view':
          return { content: await this.createSavedView(user, inv.input) };
        case 'list_document_packages':
          return { content: await this.listDocumentPackages(user) };
        case 'list_document_folders':
          return { content: await this.listDocumentFolders(user, inv.input) };
        case 'create_document_folder':
          return { content: await this.createDocumentFolder(user, inv.input) };
        case 'update_checklist_item':
          return { content: await this.updateChecklistItem(user, inv.input) };
        case 'link_document_to_data_room':
          return { content: await this.linkDocumentToDataRoom(user, inv.input) };
        case 'add_data_room_group':
          return { content: await this.addDataRoomGroup(user, inv.input) };
        case 'revoke_data_room_grant':
          return { content: await this.revokeDataRoomGrant(user, inv.input) };
        case 'get_data_room_questions':
          return { content: await this.getDataRoomQuestions(user, inv.input) };
        case 'get_data_room_access_log':
          return { content: await this.getDataRoomAccessLog(user, inv.input) };
        case 'get_transaction_parties':
          return { content: await this.getTransactionParties(user, inv.input) };
        case 'add_disclosure_schedule':
          return { content: await this.addDisclosureSchedule(user, inv.input) };
        case 'add_corporate_minute':
          return { content: await this.addCorporateMinute(user, inv.input) };
        case 'assign_matter_lawyer':
          return { content: await this.assignMatterLawyer(user, inv.input) };
        case 'get_kyc_summary':
          return { content: await this.getKycSummary(user) };
        case 'get_template_detail':
          return { content: await this.getTemplateDetail(user, inv.input) };
        case 'get_closing_checklist_detail':
          return { content: await this.getClosingChecklistDetail(user, inv.input) };
        case 'create_closing_checklist':
          return { content: await this.createClosingChecklist(user, inv.input) };
        case 'update_closing_item':
          return { content: await this.updateClosingItem(user, inv.input) };
        case 'get_data_room':
          return { content: await this.getDataRoom(user, inv.input) };
        case 'create_data_room':
          return { content: await this.createDataRoom(user, inv.input) };
        case 'add_data_room_folder':
          return { content: await this.addDataRoomFolder(user, inv.input) };
        case 'get_disclosure_schedules':
          return { content: await this.getDisclosureSchedules(user, inv.input) };
        case 'add_registry_filing':
          return { content: await this.addRegistryFiling(user, inv.input) };
        case 'add_share_transfer':
          return { content: await this.addShareTransfer(user, inv.input) };
        case 'add_registry_obligation':
          return { content: await this.addRegistryObligation(user, inv.input) };
        case 'update_registry_obligation':
          return { content: await this.updateRegistryObligation(user, inv.input) };
        case 'run_playbook_review':
          return { content: await this.runPlaybookReview(user, inv.input) };
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
    // Idempotencia: si ya existe un cliente con ese identificador fiscal en el despacho, NO se duplica;
    // se devuelve el existente para que el agente lo reutilice (defensa ante reintentos/confirmaciones).
    const existing = await this.prisma.client.findFirst({
      where: { tenantId: user.tenantId, taxId },
      select: { id: true, name: true, taxId: true, taxIdKind: true },
    });
    if (existing) {
      return json({
        created: false,
        alreadyExists: true,
        clientId: existing.id,
        name: existing.name,
        taxId: existing.taxId,
        message: `Ya existe un cliente con ese identificador fiscal: "${existing.name}". Lo reutilizo (no se ha duplicado).`,
      });
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

  private async createPresentationType(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const name = str(input, 'name');
    const sector = str(input, 'sector');
    if (!name || name.length < 2) {
      return json({
        error: 'El nombre del tipo de presentación es obligatorio (mínimo 2 caracteres).',
      });
    }
    if (!sector) {
      return json({
        error: 'El sector o gestión es obligatorio (p. ej. "Mercantil", "Extranjería").',
      });
    }
    const jurRaw = str(input, 'jurisdiction');
    const jurisdiction = jurRaw === 'ES' || jurRaw === 'DO' ? (jurRaw as Jurisdiction) : undefined;
    const description = str(input, 'description');

    const reqsIn = Array.isArray(input.requirements) ? input.requirements : [];
    const requirements = reqsIn
      .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}))
      .map((r) => ({
        name: (str(r, 'name') ?? '').slice(0, 200),
        description: str(r, 'description') || undefined,
        required: typeof r.required === 'boolean' ? (r.required as boolean) : undefined,
      }))
      .filter((r) => r.name.length > 0);

    const tplsIn = Array.isArray(input.taskTemplates) ? input.taskTemplates : [];
    const taskTemplates = tplsIn
      .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : {}))
      .map((t) => ({
        title: (str(t, 'title') ?? '').slice(0, 200),
        offsetDays: typeof t.offsetDays === 'number' ? (t.offsetDays as number) : undefined,
      }))
      .filter((t) => t.title.length > 0);

    try {
      const created = await this.presentations.createType(user, {
        name: name.slice(0, 200),
        sector: sector.slice(0, 120),
        jurisdiction,
        description: description ? description.slice(0, 2000) : undefined,
        requirements,
        taskTemplates,
      });
      return json({
        created: true,
        presentationTypeId: created.id,
        name: created.name,
        sector: created.sector,
        requirements: created.requirements.length,
        taskTemplates: created.taskTemplates.length,
        message: `Tipo de presentación "${created.name}" creado con ${created.requirements.length} requisito(s) documental(es)${
          created.taskTemplates.length
            ? ` y ${created.taskTemplates.length} tarea(s) plantilla`
            : ''
        }. Ya puedes aplicarlo a un expediente con apply_presentation_to_matter.`,
      });
    } catch (e) {
      return json({ created: false, error: (e as Error).message || String(e) });
    }
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

  private async convertLeadToClient(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const leadId = str(input, 'leadId');
    if (!leadId) {
      return json({ error: 'El ID del lead es obligatorio.' });
    }

    const taxId = str(input, 'taxId');
    if (!taxId) {
      return json({
        error: 'Identificador fiscal (NIF/CIF/RNC) obligatorio para convertir el lead.',
      });
    }

    const docTypeRaw = str(input, 'docType');
    const docType = docTypeRaw === 'PASSPORT' || docTypeRaw === 'OTHER' ? docTypeRaw : undefined;

    const createMatter = input.createMatter === true;
    const matterTitle = str(input, 'matterTitle');
    const matterType = str(input, 'matterType');

    try {
      const result = await this.leads.convert(user, leadId, {
        taxId,
        docType: docType as any,
        createMatter,
        matterTitle: matterTitle ? matterTitle.slice(0, 200) : undefined,
        matterType: matterType ? matterType.slice(0, 80) : undefined,
      });

      // Enriquecemos la respuesta con los datos del cliente convertido
      const client = await this.clients.findOne(user, result.clientId);

      return json({
        converted: true,
        clientId: result.clientId,
        clientName: client.name,
        taxId: client.taxId,
        taxIdKind: client.taxIdKind ?? null,
        matterCreated: createMatter && !!result.matterId,
        matterId: result.matterId ?? null,
        message: `Lead convertido: cliente "${client.name}" creado exitosamente${
          result.matterId ? ' con expediente asociado' : ''
        }. Ya puedes gestionar el cliente y sus expedientes.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('alreadyConverted')) {
        return json({
          converted: false,
          error: 'Este lead ya ha sido convertido previamente; no se puede convertir de nuevo.',
        });
      }
      if (msg.includes('invalid') || msg.includes('Invalid')) {
        return json({
          converted: false,
          error:
            'Identificador fiscal no válido en esta jurisdicción o tipo de documento incorrecto.',
        });
      }
      return json({
        converted: false,
        error: msg.includes('notFound') ? 'El lead no existe o no es accesible.' : msg,
      });
    }
  }

  private async updateLead(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const leadId = str(input, 'leadId');
    if (!leadId) {
      return json({ error: 'El ID del lead es obligatorio.' });
    }

    // Valida el estado si se proporciona
    const status = str(input, 'status');
    if (status && !['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'].includes(status)) {
      return json({
        error: 'Estado no válido. Usa: NEW, CONTACTED, QUALIFIED, CONVERTED o LOST.',
      });
    }

    // Valida y normaliza campos opcionales
    const name = str(input, 'name');
    if (name && name.length < 2) {
      return json({ error: 'El nombre debe tener al menos 2 caracteres.' });
    }

    const email = str(input, 'email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'El email no tiene un formato válido.' });
    }

    const phone = str(input, 'phone');
    if (phone && phone.length > 40) {
      return json({ error: 'El teléfono no puede exceder 40 caracteres.' });
    }

    const company = str(input, 'company');
    if (company && company.length > 200) {
      return json({ error: 'La empresa no puede exceder 200 caracteres.' });
    }

    const subject = str(input, 'subject');
    if (subject && subject.length > 500) {
      return json({ error: 'El asunto no puede exceder 500 caracteres.' });
    }

    const notes = str(input, 'notes');
    if (notes && notes.length > 5000) {
      return json({ error: 'Las notas no pueden exceder 5000 caracteres.' });
    }

    const estimatedValueRaw = input.estimatedValue;
    let estimatedValue: number | undefined;
    if (estimatedValueRaw !== undefined && estimatedValueRaw !== null) {
      const val = Number(estimatedValueRaw);
      if (!Number.isFinite(val) || val < 0) {
        return json({ error: 'El valor estimado debe ser un número positivo.' });
      }
      estimatedValue = val;
    }

    const source = str(input, 'source');

    const assignedToId = str(input, 'assignedToId');

    try {
      const lead = await this.leads.update(user, leadId, {
        name,
        email,
        phone,
        company,
        subject,
        notes,
        source,
        estimatedValue: estimatedValue !== undefined ? String(estimatedValue) : undefined,
        assignedToId,
        status: status as any, // LeadStatus enum: NEW | CONTACTED | QUALIFIED | CONVERTED | LOST
      });

      return json({
        updated: true,
        leadId: lead.id,
        name: lead.name,
        status: lead.status,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        company: lead.company ?? null,
        estimatedValue: lead.estimatedValue ?? null,
        assignedTo: lead.assignedTo?.fullName ?? null,
      });
    } catch (e) {
      // LeadsService.update lanza NotFoundException si el lead no existe o no es del tenant.
      // También BadRequestException si assignedToId es inválido o no es del despacho (L-6).
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `El lead con ID ${leadId} no existe o no es accesible en tu despacho.`,
        });
      }
      if (message.includes('assigneeNotInFirm')) {
        return json({
          error: 'El letrado indicado no existe en tu despacho o no es accesible.',
        });
      }
      throw e;
    }
  }

  private async getClientKyc(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'Falta el ID del cliente.' });
    const profile = await this.kyc.getForClient(user, clientId);
    if (!profile) {
      return json({
        found: false,
        clientId,
        status: null,
        note: 'Diligencia KYC aún no iniciada para este cliente.',
      });
    }
    return json({
      found: true,
      clientId: profile.clientId,
      status: profile.status ?? null,
      risk: profile.risk ?? null,
      isPep: profile.isPep ?? false,
      identityVerified: profile.identityVerified ?? false,
      sanctionsChecked: profile.sanctionsChecked ?? false,
      notes: profile.notes ?? null,
      reviewedById: profile.reviewedById ?? null,
      reviewedAt: profile.reviewedAt ? profile.reviewedAt.toISOString().slice(0, 10) : null,
    });
  }

  private async upsertClientKyc(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'El ID del cliente es obligatorio.' });

    const status = str(input, 'status');
    if (status && !['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'].includes(status)) {
      return json({
        error: 'Estado no válido. Elige uno de: PENDING, IN_REVIEW, APPROVED, REJECTED.',
      });
    }

    const risk = str(input, 'risk');
    if (risk && !['LOW', 'MEDIUM', 'HIGH'].includes(risk)) {
      return json({ error: 'Riesgo no válido. Elige uno de: LOW, MEDIUM, HIGH.' });
    }

    const notes = str(input, 'notes');
    if (notes && notes.length > 4000) {
      return json({ error: 'Las notas no pueden exceder 4000 caracteres.' });
    }

    const isPep = typeof input.isPep === 'boolean' ? input.isPep : undefined;
    const identityVerified =
      typeof input.identityVerified === 'boolean' ? input.identityVerified : undefined;
    const sanctionsChecked =
      typeof input.sanctionsChecked === 'boolean' ? input.sanctionsChecked : undefined;

    try {
      const profile = await this.kyc.upsert(user, clientId, {
        status: status as any,
        risk: risk as any,
        isPep,
        identityVerified,
        sanctionsChecked,
        notes,
      });

      return json({
        updated: true,
        profileId: profile.id,
        clientId: profile.clientId,
        status: profile.status,
        risk: profile.risk ?? null,
        isPep: profile.isPep,
        identityVerified: profile.identityVerified,
        sanctionsChecked: profile.sanctionsChecked,
        reviewedBy: user.userId,
        reviewedAt: profile.reviewedAt?.toISOString().slice(0, 10) ?? null,
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('clients.notFound') || message.includes('notFound')) {
        return json({
          error: `El cliente con ID ${clientId} no existe o no pertenece a tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async listAppointmentsForLawyer(user: RequestUser): Promise<string> {
    const appointments = await this.scheduling.listFirmAppointments(user);
    if (appointments.length === 0) {
      return json({ count: 0, appointments: [], note: 'No hay citas futuras programadas.' });
    }
    return json({
      count: appointments.length,
      appointments: appointments.map((a) => ({
        id: a.id,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        dayLabel: a.dayLabel,
        timeLabel: a.timeLabel,
        note: a.note,
        lawyer: a.lawyer ? { id: a.lawyer.id, name: a.lawyer.name } : undefined,
        client: a.client ? { id: a.client.id, name: a.client.name } : undefined,
        matter: a.matter ? { id: a.matter.id, label: a.matter.label } : undefined,
      })),
    });
  }

  private async confirmAppointment(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const appointmentId = str(input, 'appointmentId');
    if (!appointmentId) {
      return json({ error: 'El ID de la cita es obligatorio.' });
    }

    try {
      await this.scheduling.setStatus(user, appointmentId, 'CONFIRMED');
      return json({
        confirmed: true,
        appointmentId,
        message:
          'Cita confirmada exitosamente. El cliente recibirá notificación de la confirmación.',
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound') || message.includes('scheduling.notFound')) {
        return json({
          error: `La cita con ID ${appointmentId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async cancelAppointment(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const appointmentId = str(input, 'appointmentId');
    if (!appointmentId) {
      return json({ error: 'El ID de la cita es obligatorio.' });
    }

    try {
      await this.scheduling.setStatus(user, appointmentId, 'CANCELLED');

      // Recupera detalles de la cita cancelada para confirmar al usuario
      const appt = await this.prisma.appointment.findFirst({
        where: { tenantId: user.tenantId, id: appointmentId },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          lawyer: { select: { fullName: true } },
          client: { select: { name: true } },
        },
      });

      return json({
        cancelled: true,
        appointmentId: appointmentId,
        status: 'CANCELLED',
        originalStart: appt?.startsAt ? appt.startsAt.toISOString().slice(0, 10) : null,
        originalTime: appt?.startsAt ? appt.startsAt.toISOString().slice(11, 16) : null,
        lawyer: appt?.lawyer?.fullName ?? null,
        client: appt?.client?.name ?? null,
        note: 'La cita ha sido cancelada. El cliente ha sido notificado automáticamente.',
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `La cita con ID ${appointmentId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async listSavedViews(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const scope = str(input, 'scope');
    if (!scope || !['invoices', 'tasks', 'matters'].includes(scope)) {
      return json({ error: 'Ámbito no válido. Elige uno de: invoices, tasks, matters.' });
    }
    const views = await this.savedViews.list(user, scope as 'tasks' | 'invoices' | 'matters');
    if (views.length === 0) {
      return json({ count: 0, scope, views: [], note: `No hay vistas guardadas en "${scope}".` });
    }
    return json({
      count: views.length,
      scope,
      views: views.map((v) => ({
        id: v.id,
        name: v.name,
        scope: v.scope,
        filters: v.filters,
        createdAt: v.createdAt.toISOString().slice(0, 10),
      })),
    });
  }

  private async getEmailSnippets(_user: RequestUser): Promise<string> {
    const snippets = await this.emailSnippets.list();
    if (snippets.length === 0)
      return json({
        count: 0,
        snippets: [],
        note: 'No hay plantillas de correo en la biblioteca.',
      });
    return json({
      count: snippets.length,
      snippets: snippets.map((s) => ({
        id: s.id,
        name: s.name,
        subject: s.subject ?? null,
        body: s.body.slice(0, 600),
      })),
    });
  }

  private async listDataRooms(user: RequestUser, input: Record<string, unknown>): Promise<string> {
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

    const rooms = await this.dataRoom.listByMatter(user, matter.id);
    if (rooms.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        rooms: [],
        note: 'No hay data rooms en este expediente.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      count: rooms.length,
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        watermark: r.watermark,
        createdAt: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : null,
        documentCount: r._count.documents,
        grantCount: r._count.grants,
        questionCount: r._count.questions,
      })),
    });
  }

  private async createDataRoomGrant(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const roomId = str(input, 'roomId');
    if (!roomId) return json({ error: 'Falta el ID de la sala de datos.' });

    const email = str(input, 'email');
    if (!email) return json({ error: 'Falta el correo del usuario externo.' });

    const name = str(input, 'name');
    const groupId = str(input, 'groupId');
    const canDownload = typeof input.canDownload === 'boolean' ? input.canDownload : true;
    const folderIds = Array.isArray(input.folderIds)
      ? (input.folderIds as string[]).filter((id) => typeof id === 'string' && id.trim().length > 0)
      : [];
    const expiresInDays = int(input, 'expiresInDays', 0, 365);

    try {
      const result = await this.dataRoom.createGrant(user, roomId, {
        email,
        name,
        groupId: groupId || undefined,
        canDownload,
        folderIds: folderIds.length > 0 ? folderIds : undefined,
        expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
      });

      return json({
        created: true,
        grantId: result.id,
        email: result.email,
        token: result.token,
        note: `Enlace mágico generado. Comparte el token con ${result.email}. Se devuelve solo esta vez; guárdalo.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          created: false,
          error: 'La sala de datos no existe o no es accesible en tu despacho.',
        });
      }
      return json({ created: false, error: msg });
    }
  }

  private async answerDataRoomQuestion(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const questionId = str(input, 'questionId');
    if (!questionId) {
      return json({ error: 'El ID de la pregunta es obligatorio.' });
    }
    const answer = typeof input.answer === 'string' ? input.answer.trim() : '';
    if (answer.length < 1 || answer.length > 8000) {
      return json({
        error: 'La respuesta debe tener entre 1 y 8000 caracteres.',
      });
    }

    try {
      const questions = await this.dataRoom.answerQuestion(user, questionId, { answer });
      return json({
        answered: true,
        questionId,
        answerLength: answer.length,
        totalQuestions: questions.length,
        note: `Respuesta registrada. Total de preguntas en la sala: ${questions.length}.`,
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound') || message.includes('questionNotFound')) {
        return json({
          error: `La pregunta con ID ${questionId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async downloadDataRoomDocumentInternal(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const docId = str(input, 'docId');
    if (!docId) return json({ error: 'Falta el ID del documento.' });
    try {
      const result = await this.dataRoom.downloadInternal(user, docId);
      return json({
        success: true,
        name: result.name,
        mimeType: result.mimeType,
        note: 'Documento descargado (staff, sin marca de agua).',
      });
    } catch (e) {
      if ((e as any).code === 'P2025' || (e as Error).message?.includes('notFound')) {
        return json({ success: false, error: `Documento no encontrado con ID ${docId}.` });
      }
      throw e;
    }
  }

  private async addTransactionParty(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });

    const name = str(input, 'name');
    if (!name || name.length < 1) {
      return json({ error: 'El nombre de la parte es obligatorio (1-200 caracteres).' });
    }

    const side = str(input, 'side');
    if (!side || !['BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER'].includes(side)) {
      return json({
        error: 'Lado no válido. Elige uno de: BUYER, SELLER, COMPANY, LENDER, BORROWER, OTHER.',
      });
    }

    const role = str(input, 'role');
    if (
      !role ||
      !['PRINCIPAL', 'LEGAL_COUNSEL', 'FINANCIAL_ADVISOR', 'NOTARY', 'OTHER'].includes(role)
    ) {
      return json({
        error:
          'Rol no válido. Elige uno de: PRINCIPAL, LEGAL_COUNSEL, FINANCIAL_ADVISOR, NOTARY, OTHER.',
      });
    }

    const organization = str(input, 'organization');
    const email = str(input, 'email');
    const phone = str(input, 'phone');
    const notes = str(input, 'notes');
    const isDistribution =
      typeof input.isDistribution === 'boolean' ? input.isDistribution : undefined;

    // Resuelve el expediente por referencia (acotado por tenant)
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true },
    });
    if (!matter) {
      return json({
        added: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha añadido la parte.`,
      });
    }

    // Delega al servicio (que maneja acotamiento por tenant, sortOrder y auditoría)
    const overview = await this.deal.addParty(user, matter.id, {
      name: name.slice(0, 200),
      side,
      role,
      organization: organization ? organization.slice(0, 200) : undefined,
      email: email ? email.slice(0, 200) : undefined,
      phone: phone ? phone.slice(0, 50) : undefined,
      notes: notes ? notes.slice(0, 2000) : undefined,
      isDistribution,
    });

    return json({
      added: true,
      matter: matterReference,
      partyName: name,
      side,
      role,
      totalParties: overview.parties.length,
      note: `Parte "${name}" agregada a la operación (${side}, ${role}).`,
    });
  }

  private async updateTransactionParty(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const partyId = str(input, 'partyId');
    if (!partyId) {
      return json({ error: 'El ID de la parte es obligatorio.' });
    }

    // Validar campos opcionales
    const name = str(input, 'name');
    if (name && name.length < 1) {
      return json({ error: 'El nombre debe tener al menos 1 carácter.' });
    }

    const email = str(input, 'email');
    if (email && !this.isValidEmail(email)) {
      return json({ error: 'Correo electrónico no válido.' });
    }

    const organization = str(input, 'organization');
    const phone = str(input, 'phone');
    if (phone && phone.length > 50) {
      return json({ error: 'El teléfono no puede exceder 50 caracteres.' });
    }

    const notes = str(input, 'notes');
    if (notes && notes.length > 2000) {
      return json({ error: 'Las notas no pueden exceder 2000 caracteres.' });
    }

    const side = str(input, 'side');
    const validSides = ['BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER'];
    if (side && !validSides.includes(side)) {
      return json({
        error: 'Lado no válido. Elige uno de: BUYER, SELLER, COMPANY, LENDER, BORROWER, OTHER.',
      });
    }

    const role = str(input, 'role');
    const validRoles = ['PRINCIPAL', 'LEGAL_COUNSEL', 'FINANCIAL_ADVISOR', 'NOTARY', 'OTHER'];
    if (role && !validRoles.includes(role)) {
      return json({
        error:
          'Rol no válido. Elige uno de: PRINCIPAL, LEGAL_COUNSEL, FINANCIAL_ADVISOR, NOTARY, OTHER.',
      });
    }

    try {
      const updateDto: Record<string, unknown> = {};
      if (name !== undefined) (updateDto as any).name = name;
      if (organization !== undefined) (updateDto as any).organization = organization;
      if (email !== undefined) (updateDto as any).email = email;
      if (phone !== undefined) (updateDto as any).phone = phone;
      if (side !== undefined) (updateDto as any).side = side;
      if (role !== undefined) (updateDto as any).role = role;
      if (notes !== undefined) (updateDto as any).notes = notes;

      const result = await this.deal.updateParty(user, partyId, updateDto);

      // Buscar la parte actualizada en el resultado para reportar cambios
      const party = result.parties.find((p: any) => p.id === partyId);

      return json({
        updated: true,
        partyId,
        party: party
          ? {
              name: party.name,
              organization: party.organization ?? null,
              email: party.email ?? null,
              phone: party.phone ?? null,
              side: party.side,
              role: party.role,
              notes: party.notes ?? null,
            }
          : null,
        message: 'Datos de la parte actualizados exitosamente.',
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `La parte con ID ${partyId} no existe o no es accesible en tu despacho.`,
        });
      }
      return json({
        error: `No se pudo actualizar: ${message}`,
      });
    }
  }

  /** Helper: valida formato email básico. */
  private isValidEmail(email: string): boolean {
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
  }

  private async getTransactionMilestones(
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

    const overview = await this.deal.overview(user, matter.id);

    if (overview.milestones.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        milestones: [],
        note: 'No hay hitos definidos en esta operación.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      count: overview.milestones.length,
      milestones: overview.milestones.map((m) => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        targetDate: m.targetDate ? m.targetDate.toISOString().slice(0, 10) : null,
        status: m.status,
        completedAt: m.completedAt ? m.completedAt.toISOString().slice(0, 10) : null,
        notes: m.notes ?? null,
      })),
    });
  }

  private async addTransactionMilestone(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const kind = str(input, 'kind');
    const title = str(input, 'title');
    const targetDateRaw = str(input, 'targetDate');
    const notes = str(input, 'notes');

    if (!matterReference) {
      return json({ error: 'Falta la referencia del expediente de operación.' });
    }
    if (
      !kind ||
      ![
        'SIGNING',
        'CLOSING',
        'LONGSTOP',
        'CONDITIONS_DEADLINE',
        'FUNDS_FLOW',
        'FILING',
        'CUSTOM',
      ].includes(kind)
    ) {
      return json({
        error:
          'Tipo de hito no válido. Elige uno de: SIGNING, CLOSING, LONGSTOP, CONDITIONS_DEADLINE, FUNDS_FLOW, FILING o CUSTOM.',
      });
    }
    if (!title || title.length < 2) {
      return json({ error: 'El título del hito es obligatorio (mínimo 2 caracteres).' });
    }
    if (!targetDateRaw) {
      return json({ error: 'Indica la fecha objetivo del hito en formato YYYY-MM-DD.' });
    }

    // Valida que la fecha sea válida
    const targetDate = new Date(targetDateRaw);
    if (Number.isNaN(targetDate.getTime())) {
      return json({
        error: `Fecha objetivo no válida: ${targetDateRaw}. Usa el formato YYYY-MM-DD.`,
      });
    }

    // Resuelve el expediente por referencia (acotado por tenant)
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        created: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha creado el hito.`,
      });
    }

    try {
      // Delega al servicio (que maneja validaciones y auditoría)
      const overview = await this.deal.addMilestone(user, matter.id, {
        kind,
        title: title.slice(0, 200),
        targetDate: targetDateRaw,
        notes,
      });

      return json({
        created: true,
        matterReference: matter.reference,
        kind,
        title,
        targetDate: targetDateRaw,
        note: `Hito de ${kind} creado: "${title}" para el ${targetDateRaw}. Se han registrado los hitos de la operación.`,
        overview: {
          milestonesCount: overview.milestones.length,
          milestones: overview.milestones.map((m) => ({
            kind: m.kind,
            title: m.title,
            targetDate: m.targetDate ? m.targetDate.toISOString().slice(0, 10) : null,
            status: m.status,
          })),
        },
      });
    } catch (e) {
      const msg = (e as Error).message || 'Error desconocido';
      return json({
        created: false,
        note: `No se pudo crear el hito: ${msg}`,
      });
    }
  }

  private async updateTransactionMilestone(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const milestoneId = str(input, 'milestoneId');
    if (!milestoneId) {
      return json({ error: 'El ID del hito es obligatorio.' });
    }

    const status = str(input, 'status');
    if (status && !['PENDING', 'DONE', 'MISSED'].includes(status)) {
      return json({
        error: 'Estado no válido. Usa: PENDING, DONE o MISSED.',
      });
    }

    const title = str(input, 'title');
    if (title && title.length < 2) {
      return json({ error: 'El título debe tener al menos 2 caracteres.' });
    }

    const notes = str(input, 'notes');
    if (notes && notes.length > 2000) {
      return json({ error: 'Las notas no pueden exceder 2000 caracteres.' });
    }

    const targetDateRaw = str(input, 'targetDate');
    let targetDate: string | undefined;
    if (targetDateRaw) {
      const d = new Date(targetDateRaw);
      if (Number.isNaN(d.getTime())) {
        return json({
          error: `Fecha de vencimiento no válida: ${targetDateRaw}. Usa el formato YYYY-MM-DD.`,
        });
      }
      targetDate = d.toISOString();
    }

    try {
      const overview = await this.deal.updateMilestone(user, milestoneId, {
        title,
        targetDate,
        status: status as any,
        notes,
      });

      // Localiza el hito actualizado en la respuesta para confirmación
      const milestone = overview.milestones?.find((m: any) => m.id === milestoneId);
      return json({
        updated: true,
        milestoneId,
        title: milestone?.title ?? 'Hito actualizado',
        status: milestone?.status ?? status ?? null,
        targetDate: milestone?.targetDate
          ? new Date(milestone.targetDate).toISOString().slice(0, 10)
          : null,
        completedAt: milestone?.completedAt
          ? new Date(milestone.completedAt).toISOString().slice(0, 10)
          : null,
        message: 'Hito de operación actualizado exitosamente.',
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `El hito con ID ${milestoneId} no existe o no es accesible en tu operación.`,
        });
      }
      throw e;
    }
  }

  private async updateDisclosureSchedule(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const disclosureId = str(input, 'disclosureId');
    if (!disclosureId) {
      return json({ error: 'El ID del disclosure schedule es obligatorio.' });
    }

    // Valida que solo se proporcionen campos conocidos
    const allowedFields = new Set([
      'number',
      'repWarranty',
      'title',
      'body',
      'documentId',
      'status',
    ]);
    const providedFields = Object.keys(input).filter((k) => !['disclosureId'].includes(k));
    const unknownFields = providedFields.filter((f) => !allowedFields.has(f));
    if (unknownFields.length > 0) {
      return json({
        error: `Campos no reconocidos: ${unknownFields.join(', ')}. Usa: number, repWarranty, title, body, documentId, status.`,
      });
    }

    // Construye el DTO para la actualización (solo campos provistos)
    const dto: Record<string, unknown> = {};
    if (input.number !== undefined) {
      const num = str(input, 'number');
      if (num && num.length < 1) {
        return json({ error: 'El número debe tener al menos 1 carácter.' });
      }
      dto.number = num as any;
    }
    if (input.repWarranty !== undefined) {
      dto.repWarranty = str(input, 'repWarranty') as any;
    }
    if (input.title !== undefined) {
      const tit = str(input, 'title');
      if (tit && tit.length < 1) {
        return json({ error: 'El título debe tener al menos 1 carácter.' });
      }
      dto.title = tit as any;
    }
    if (input.body !== undefined) {
      dto.body = typeof input.body === 'string' ? input.body : undefined;
    }
    if (input.documentId !== undefined) {
      const docId = input.documentId === '' ? null : str(input, 'documentId');
      dto.documentId = docId as any;
    }
    if (input.status !== undefined) {
      const st = str(input, 'status');
      if (st && !['DRAFT', 'AGREED'].includes(st)) {
        return json({
          error: 'Estado no válido. Usa DRAFT (borrador) o AGREED (acordado).',
        });
      }
      dto.status = st as any;
    }

    // Si no se proporciona ningún campo para actualizar, devuelve error
    if (Object.keys(dto).length === 0) {
      return json({
        error:
          'Indica al menos un campo a actualizar (number, repWarranty, title, body, documentId o status).',
      });
    }

    try {
      // Delega al servicio deal (acotado por tenant, con validación de documento)
      const overview = await this.deal.updateDisclosure(user, disclosureId, dto);

      // Busca el schedule actualizado en la respuesta para confirmar
      const updated = overview.disclosureSchedules.find((d: any) => d.id === disclosureId);
      if (!updated) {
        return json({
          updated: true,
          note: 'Disclosure schedule actualizado (sin datos de confirmación).',
        });
      }

      return json({
        updated: true,
        disclosureId: updated.id,
        number: updated.number,
        title: updated.title,
        status: updated.status,
        documentId: updated.documentId ?? null,
        message: `Disclosure schedule "${updated.title}" actualizado exitosamente.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('not found')) {
        return json({
          updated: false,
          error: `El disclosure schedule con ID ${disclosureId} no existe o no es accesible.`,
        });
      }
      if (msg.includes('document') || msg.includes('Document')) {
        return json({
          updated: false,
          error: 'El documento especificado no existe o no pertenece al despacho.',
        });
      }
      throw e;
    }
  }

  private async getRegistryFilings(
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

    // Delega a DealService.overview() que ya está tenant-scoped y devuelve registryFilings
    const dealOverview = await this.deal.overview(user, matter.id);

    if (!dealOverview.registryFilings || dealOverview.registryFilings.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        filings: [],
        note: 'No hay presentaciones registrales en esta operación.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      count: dealOverview.registryFilings.length,
      filings: dealOverview.registryFilings.map((f) => ({
        id: f.id,
        registry: f.registry, // tipo: REGISTRO_MERCANTIL, NOTARIA, etc.
        title: f.title,
        status: f.status, // PENDING, SUBMITTED, REGISTERED, REJECTED
        referenceCode: f.referenceCode ?? null,
        submittedAt: f.submittedAt ? f.submittedAt.toISOString().slice(0, 10) : null,
        registeredAt: f.registeredAt ? f.registeredAt.toISOString().slice(0, 10) : null,
        hasDocument: f.documentId !== null && f.documentId !== undefined,
        notes: f.notes ?? null,
      })),
    });
  }

  private async updateRegistryFiling(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const filingId = str(input, 'filingId');
    if (!filingId) {
      return json({ error: 'El ID de la presentación registral es obligatorio.' });
    }

    const matterReference = str(input, 'matterReference');
    if (!matterReference) {
      return json({ error: 'La referencia del expediente es obligatoria para validar contexto.' });
    }

    // Validar que el expediente existe y pertenece al tenant
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true },
    });
    if (!matter) {
      return json({
        updated: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    }

    // Extraer campos opcionales
    const registry = str(input, 'registry');
    const title = str(input, 'title');
    const referenceCode = str(input, 'referenceCode');
    const status = str(input, 'status');
    const notes = str(input, 'notes');
    const documentId = str(input, 'documentId');
    const sortOrder = int(input, 'sortOrder', 0, 10000);

    // Validar estado si se proporciona
    if (status && !['PENDING', 'SUBMITTED', 'REGISTERED', 'REJECTED'].includes(status)) {
      return json({
        error: 'Estado no válido. Usa: PENDING, SUBMITTED, REGISTERED o REJECTED.',
      });
    }

    try {
      const filing = await this.deal.updateFiling(user, filingId, {
        registry,
        title,
        referenceCode,
        status,
        notes,
        documentId,
        ...(sortOrder > 0 ? { sortOrder } : {}),
      });

      return json({
        updated: true,
        filingId: filing.registryFilings?.[0]?.id ?? filingId,
        title: filing.registryFilings?.[0]?.title ?? title,
        status: filing.registryFilings?.[0]?.status ?? status,
        matterReference,
        message: `Presentación registral actualizada exitosamente.${status === 'SUBMITTED' ? ' Fecha de envío sellada.' : ''}${status === 'REGISTERED' ? ' Fecha de registro sellada.' : ''}`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          updated: false,
          error: `La presentación registral con ID ${filingId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async getEngagementLetter(
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

    const letter = await this.engagement.getByMatter(user, matter.id);
    if (!letter) {
      return json({
        found: true,
        matter: matterReference,
        letterExists: false,
        note: 'Aún no se ha generado una hoja de encargo en este expediente.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      letterExists: true,
      scope: letter.scope,
      fees: letter.fees,
      terms: letter.terms,
      status: letter.status,
      generatedAt: letter.createdAt ? letter.createdAt.toISOString().slice(0, 10) : null,
      documentId: letter.documentId ?? null,
    });
  }

  private async saveEngagementLetter(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });

    const scope = str(input, 'scope');
    if (!scope || scope.length < 1) {
      return json({ error: 'El alcance del encargo es obligatorio (mínimo 1 carácter).' });
    }
    if (scope.length > 8000) {
      return json({ error: 'El alcance no puede exceder 8000 caracteres.' });
    }

    const fees = str(input, 'fees');
    if (!fees || fees.length < 1) {
      return json({ error: 'La estructura de honorarios es obligatoria (mínimo 1 carácter).' });
    }
    if (fees.length > 8000) {
      return json({ error: 'Los honorarios no pueden exceder 8000 caracteres.' });
    }

    const terms = str(input, 'terms');
    if (!terms || terms.length < 1) {
      return json({ error: 'Los términos y condiciones son obligatorios (mínimo 1 carácter).' });
    }
    if (terms.length > 8000) {
      return json({ error: 'Los términos no pueden exceder 8000 caracteres.' });
    }

    // Resuelve la referencia del expediente a su ID (acotado por tenant)
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true },
    });
    if (!matter) {
      return json({
        created: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha generado la hoja de encargo.`,
      });
    }

    try {
      const letter = await this.engagement.save(user, {
        matterId: matter.id,
        scope,
        fees,
        terms,
      });
      return json({
        created: true,
        letterDocumentId: letter.documentId,
        matter: matterReference,
        status: letter.status,
        scope: scope.slice(0, 100) + (scope.length > 100 ? '…' : ''),
        note: 'Hoja de encargo generada como PDF. Queda pendiente de firma digital del cliente.',
      });
    } catch (e) {
      const msg = (e as Error).message || 'Error desconocido';
      return json({
        created: false,
        error: msg.includes('notFound') ? `Expediente no encontrado: ${matterReference}` : msg,
      });
    }
  }

  private async getCompanySecretaryOverview(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'Falta el ID del cliente/sociedad.' });

    try {
      const overview = await this.companySecretary.overview(user, clientId);
      return json({
        found: true,
        clientId,
        summary: {
          minutesCount: overview.minutes.length,
          shareholdersCount: overview.shareholders.length,
          totalUnits: overview.totalUnits,
          transfersCount: overview.transfers.length,
          obligationsCount: overview.obligations.length,
          pendingObligations: overview.obligations.filter((o) => o.status === 'PENDING').length,
        },
        minutes: overview.minutes.map((m) => ({
          id: m.id,
          kind: m.kind,
          title: m.title,
          meetingDate: m.meetingDate ? m.meetingDate.toISOString().slice(0, 10) : null,
          preview: m.body ? m.body.slice(0, 150) : null,
        })),
        shareholders: overview.shareholders.map((s) => ({
          id: s.id,
          name: s.name,
          taxId: s.taxId ?? null,
          units: s.units,
          percentage:
            overview.totalUnits > 0 ? Math.round((s.units / overview.totalUnits) * 10000) / 100 : 0,
        })),
        transfers: overview.transfers.map((t) => ({
          id: t.id,
          fromName: t.fromName ?? null,
          toName: t.toName,
          units: t.units,
          date: t.date ? t.date.toISOString().slice(0, 10) : null,
          note: t.note ?? null,
        })),
        obligations: overview.obligations.map((o) => ({
          id: o.id,
          registry: o.registry,
          title: o.title,
          referenceCode: o.referenceCode ?? null,
          dueDate: o.dueDate ? o.dueDate.toISOString().slice(0, 10) : null,
          recurrence: o.recurrence,
          status: o.status,
          filedAt: o.filedAt ? o.filedAt.toISOString().slice(0, 10) : null,
        })),
      });
    } catch (e) {
      if ((e as any).message?.includes('notFound')) {
        return json({ found: false, error: `Cliente/sociedad no encontrado: ${clientId}.` });
      }
      throw e;
    }
  }

  private async addShareholder(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'El ID de la sociedad es obligatorio.' });

    const name = str(input, 'name');
    if (!name || name.length < 1) {
      return json({ error: 'El nombre del accionista es obligatorio (mínimo 1 carácter).' });
    }

    const taxId = str(input, 'taxId');
    const unitsRaw = input.units;
    const units =
      typeof unitsRaw === 'number' && Number.isFinite(unitsRaw) ? Math.floor(unitsRaw) : undefined;
    if (units === undefined || units < 0) {
      return json({
        error: 'Las unidades deben ser un número entero >= 0.',
      });
    }

    try {
      const overview = await this.companySecretary.addShareholder(user, clientId, {
        name: name.slice(0, 200),
        taxId: taxId ? taxId.slice(0, 40) : undefined,
        units,
      });
      return json({
        created: true,
        clientId,
        shareholder: {
          name: name.slice(0, 200),
          taxId: taxId ? taxId.slice(0, 40) : null,
          units,
        },
        totalUnits: overview.totalUnits,
        shareholderCount: overview.shareholders.length,
        message: `Accionista "${name}" agregado exitosamente. Total de unidades en la sociedad: ${overview.totalUnits}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          created: false,
          error: 'La sociedad no existe o no es accesible en tu despacho.',
        });
      }
      return json({
        created: false,
        error: msg,
      });
    }
  }

  private async getFirmSettings(user: RequestUser): Promise<string> {
    const settings = await this.settings.get(user);
    return json({
      firm: {
        id: settings.tenant.id,
        name: settings.tenant.name,
        taxId: settings.tenant.taxId,
        jurisdiction: settings.tenant.jurisdiction,
        currency: settings.tenant.currency,
        locale: settings.tenant.locale,
        plan: settings.tenant.plan,
        maxAdmins: settings.tenant.maxAdmins,
        maxLawyers: settings.tenant.maxLawyers,
        invoiceSeries: settings.tenant.invoiceSeries,
        dataRegion: settings.tenant.dataRegion ?? null,
        retentionMonths: settings.tenant.retentionMonths,
        deadlineEmailRemindersEnabled: settings.tenant.deadlineEmailRemindersEnabled,
      },
      seats: settings.seats,
      counts: settings.counts,
      holidays: settings.holidays,
      certificate: settings.certificate,
    });
  }

  private async addFirmHoliday(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const date = str(input, 'date');
    const name = str(input, 'name');

    if (!date) {
      return json({ error: 'La fecha del festivo es obligatoria (formato YYYY-MM-DD).' });
    }

    const d = new Date(date + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return json({ error: `Fecha no válida: ${date}. Usa el formato YYYY-MM-DD.` });
    }

    if (!name || name.length < 2 || name.length > 100) {
      return json({ error: 'Nombre del festivo obligatorio (mínimo 2 caracteres, máximo 100).' });
    }

    try {
      const result = await this.settings.addHoliday(user, { date, name: name.trim() });
      return json({
        added: true,
        date,
        name: name.trim(),
        message: `Festivo "${name.trim()}" añadido al calendario del despacho para ${date}.`,
        holidayCount: (result.holidays ?? []).length,
      });
    } catch (e) {
      const msg = (e as Error).message || 'Error desconocido';
      if (msg.includes('holidayExists')) {
        return json({
          added: false,
          error: `Ya existe un festivo registrado para la fecha ${date}.`,
        });
      }
      return json({ added: false, error: msg });
    }
  }

  private async changeMattersStatus(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const statusStr = str(input, 'status');

    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });
    if (
      !statusStr ||
      !['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'ARCHIVED'].includes(statusStr)
    ) {
      return json({
        error: 'Estado no válido. Usa: OPEN, IN_PROGRESS, ON_HOLD, CLOSED o ARCHIVED.',
      });
    }

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true, status: true },
    });
    if (!matter) {
      return json({
        changed: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    }

    const nextStatus = statusStr as MatterStatus;
    if (matter.status === nextStatus) {
      return json({
        changed: false,
        status: nextStatus,
        note: `El expediente ya está en estado ${nextStatus}; no es necesario cambiar.`,
      });
    }

    try {
      const updated = await this.matters.changeStatus(user, matter.id, nextStatus);
      return json({
        changed: true,
        matterReference: updated.reference,
        previousStatus: matter.status,
        newStatus: updated.status,
        closedAt: updated.closedAt ? updated.closedAt.toISOString().slice(0, 10) : null,
        message: `Estado del expediente "${updated.reference}" cambió de ${matter.status} a ${updated.status}. El cambio ha sido registrado en la cronología.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('invalidTransition') || msg.includes('no permitida')) {
        return json({
          changed: false,
          error: `Transición no permitida: ${matter.status} → ${nextStatus}. Verifica la máquina de estados del expediente.`,
        });
      }
      return json({ changed: false, error: `No se pudo cambiar el estado: ${msg}` });
    }
  }

  private async updateClientInfo(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) {
      return json({ error: 'El ID del cliente es obligatorio.' });
    }

    const name = str(input, 'name');
    if (name && name.length < 2) {
      return json({ error: 'El nombre del cliente debe tener al menos 2 caracteres.' });
    }

    const email = str(input, 'email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'El email no tiene un formato válido.' });
    }

    const phone = str(input, 'phone');
    if (phone && phone.length > 40) {
      return json({ error: 'El teléfono no puede exceder 40 caracteres.' });
    }

    const address = str(input, 'address');
    if (address && address.length > 300) {
      return json({ error: 'La dirección no puede exceder 300 caracteres.' });
    }

    const taxId = str(input, 'taxId');
    const docTypeRaw = str(input, 'docType');
    const docType = docTypeRaw === 'PASSPORT' || docTypeRaw === 'OTHER' ? docTypeRaw : undefined;

    try {
      const updated = await this.clients.update(user, clientId, {
        name: name ? name.slice(0, 200) : undefined,
        email,
        phone: phone ? phone.slice(0, 40) : undefined,
        address: address ? address.slice(0, 300) : undefined,
        taxId,
        docType: docType as any,
      });

      return json({
        updated: true,
        clientId: updated.id,
        name: updated.name,
        taxId: updated.taxId,
        email: updated.email ?? null,
        phone: updated.phone ?? null,
        address: updated.address ?? null,
        taxIdKind: updated.taxIdKind ?? null,
        message: 'Datos del cliente actualizados exitosamente.',
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('Not found')) {
        return json({
          updated: false,
          error: `El cliente con ID ${clientId} no existe o no es accesible en tu despacho.`,
        });
      }
      if (msg.includes('invalid') || msg.includes('Invalid')) {
        return json({
          updated: false,
          error:
            'Identificador fiscal no válido en esta jurisdicción. Verifica el formato o tipo de documento.',
        });
      }
      return json({
        updated: false,
        error: msg,
      });
    }
  }

  private async exportClientGdpr(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    // Validar FIRM_ADMIN
    if (!user.roles.includes(Role.FIRM_ADMIN)) {
      return json({
        error: 'Solo administradores del despacho pueden exportar datos RGPD de clientes.',
      });
    }

    const clientId = str(input, 'clientId');
    if (!clientId) {
      return json({ error: 'El ID del cliente es obligatorio.' });
    }

    try {
      const exportData = await this.clients.gdprExport(user, clientId);
      return json({
        success: true,
        export: exportData,
        note: 'Exportación RGPD completada. El contenido binario de los documentos se descarga autenticado por separado.',
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `El cliente con ID ${clientId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async listLeads(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const status = str(input, 'status') as LeadStatus | undefined;
    if (status && !['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'].includes(status)) {
      return json({
        error: 'Estado no válido. Elige uno de: NEW, CONTACTED, QUALIFIED, CONVERTED, LOST.',
      });
    }
    const leads = await this.leads.list(user, status);
    if (leads.length === 0)
      return json({
        count: 0,
        status: status ?? 'all',
        leads: [],
        note: status ? `No hay leads en estado ${status}.` : 'No hay leads en el embudo.',
      });
    return json({
      count: leads.length,
      status: status ?? 'all',
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email ?? null,
        phone: l.phone ?? null,
        company: l.company ?? null,
        subject: l.subject ?? null,
        status: l.status,
        estimatedValue: l.estimatedValue ?? null,
        assignedTo: l.assignedTo?.fullName ?? null,
        source: l.source,
        createdAt: l.createdAt.toISOString().slice(0, 10),
      })),
    });
  }

  private async createLead(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const name = str(input, 'name');
    if (!name || name.length < 2) {
      return json({ error: 'El nombre del prospecto debe tener al menos 2 caracteres.' });
    }

    const email = str(input, 'email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'El email no tiene un formato válido.' });
    }

    const phone = str(input, 'phone');
    if (phone && phone.length > 40) {
      return json({ error: 'El teléfono no puede exceder 40 caracteres.' });
    }

    const company = str(input, 'company');
    if (company && company.length > 200) {
      return json({ error: 'La empresa no puede exceder 200 caracteres.' });
    }

    const subject = str(input, 'subject');
    if (subject && subject.length > 500) {
      return json({ error: 'El asunto no puede exceder 500 caracteres.' });
    }

    const notes = str(input, 'notes');
    if (notes && notes.length > 2000) {
      return json({ error: 'Las notas no pueden exceder 2000 caracteres.' });
    }

    const estimatedValueRaw = input.estimatedValue;
    let estimatedValue: string | undefined;
    if (estimatedValueRaw !== undefined && estimatedValueRaw !== null) {
      const val = Number(estimatedValueRaw);
      if (!Number.isFinite(val) || val < 0) {
        return json({ error: 'El valor estimado debe ser un número positivo.' });
      }
      estimatedValue = String(val);
    }

    const source = str(input, 'source');
    const assignedToId = str(input, 'assignedToId');

    try {
      const lead = await this.leads.create(user, {
        name,
        email,
        phone,
        company,
        subject,
        notes,
        source,
        estimatedValue,
        assignedToId,
      });

      return json({
        created: true,
        leadId: lead.id,
        name: lead.name,
        status: lead.status,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        company: lead.company ?? null,
        subject: lead.subject ?? null,
        estimatedValue: lead.estimatedValue ?? null,
        assignedTo: lead.assignedTo?.fullName ?? null,
        message: `Prospecto "${lead.name}" creado exitosamente${lead.assignedTo ? ` y asignado a ${lead.assignedTo.fullName}` : ''}. Puedes moverlo por el embudo según avance.`,
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('assigneeNotInFirm')) {
        return json({
          error: 'El letrado indicado no existe en tu despacho o no es accesible.',
        });
      }
      throw e;
    }
  }

  private async getMatterTeam(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        found: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    }

    const team = await this.matters.getTeam(user, matter.id);
    return json({
      found: true,
      reference: matterReference,
      lead: team.lead ? { id: team.lead.id, name: team.lead.fullName } : null,
      members: team.members.map((m) => ({ id: m.id, name: m.fullName })),
      count: team.members.length,
    });
  }

  private async reassignTask(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const taskId = str(input, 'taskId');
    if (!taskId) {
      return json({ error: 'El ID de la tarea es obligatorio.' });
    }

    const lawyerId = str(input, 'lawyerId');
    if (!lawyerId) {
      return json({ error: 'El ID del letrado receptor es obligatorio.' });
    }

    const reason = str(input, 'reason');

    // Obtener la tarea actual (valida tenantId y existencia)
    let task;
    try {
      task = await this.tasks.findOne(user, taskId);
    } catch (e) {
      return json({
        error: (e as Error).message?.includes('notFound')
          ? `La tarea con ID ${taskId} no existe o no es accesible en tu despacho.`
          : (e as Error).message,
      });
    }

    // Validar que el nuevo asignado existe en el tenant y tiene rol de letrado
    const lawyer = await this.prisma.user.findFirst({
      where: {
        id: lawyerId,
        tenantId: user.tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: [Role.LAWYER, Role.FIRM_ADMIN] } } } },
      },
      select: { id: true, fullName: true },
    });

    if (!lawyer) {
      return json({
        error: `El letrado con ID ${lawyerId} no existe, está inactivo, o no tiene permisos de LAWYER/ADMIN en tu despacho.`,
      });
    }

    // Si la tarea ya está asignada al mismo letrado, no hacer nada
    if (task.assigneeId === lawyerId) {
      return json({
        reassigned: false,
        note: `La tarea ya está asignada a ${lawyer.fullName}; no se realizó cambio.`,
      });
    }

    try {
      // Obtener el nombre del antiguo asignado (si existe)
      let oldAssigneeName: string | null = null;
      if (task.assigneeId) {
        const oldAssignee = await this.prisma.user.findUnique({
          where: { id: task.assigneeId },
          select: { fullName: true },
        });
        oldAssigneeName = oldAssignee?.fullName ?? null;
      }

      // Reasignar mediante TasksService.update (que valida tenant e historial)
      const updated = await this.tasks.update(user, taskId, {
        assigneeId: lawyerId,
      });

      // Log de auditoría con la razón si se proporciona
      if (reason) {
        await this.audit
          .log(user, 'task.reassigned', 'Task', taskId, {
            reason,
            fromAssignee: oldAssigneeName ?? null,
            toAssignee: lawyer.fullName,
          })
          .catch(() => undefined);
      } else {
        await this.audit
          .log(user, 'task.reassigned', 'Task', taskId, {
            fromAssignee: oldAssigneeName ?? null,
            toAssignee: lawyer.fullName,
          })
          .catch(() => undefined);
      }

      return json({
        reassigned: true,
        taskId: updated.id,
        title: updated.title,
        fromAssignee: oldAssigneeName ?? '(sin asignar)',
        toAssignee: lawyer.fullName,
        reason: reason ?? null,
        message: `Tarea "${updated.title}" reasignada de ${oldAssigneeName ?? '(sin asignar)'} a ${lawyer.fullName}${reason ? `. Motivo: ${reason}` : ''}.`,
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          error: `La tarea no existe o no es accesible en tu despacho.`,
        });
      }
      if (message.includes('assigneeNotInFirm')) {
        return json({
          error: `El letrado ${lawyerId} no pertenece a tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async createSavedView(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const scope = str(input, 'scope');
    if (!scope || !['invoices', 'tasks', 'matters'].includes(scope)) {
      return json({ error: 'Ámbito no válido. Elige uno de: invoices, tasks, matters.' });
    }

    const name = str(input, 'name');
    if (!name || name.length < 1) {
      return json({ error: 'El nombre de la vista es obligatorio (mínimo 1 carácter).' });
    }
    if (name.length > 80) {
      return json({ error: 'El nombre no puede exceder 80 caracteres.' });
    }

    const filters = input.filters;
    if (!filters || typeof filters !== 'object') {
      return json({ error: 'Los filtros son obligatorios y deben ser un objeto JSON válido.' });
    }

    try {
      const savedView = await this.savedViews.create(user, {
        scope: scope as 'invoices' | 'tasks' | 'matters',
        name,
        filters: filters as Record<string, unknown>,
      });

      return json({
        created: true,
        viewId: savedView.id,
        name: savedView.name,
        scope: savedView.scope,
        createdAt: savedView.createdAt.toISOString().slice(0, 10),
        message: `Vista "${savedView.name}" guardada exitosamente. Puedes acceder a ella desde el listado de vistas guardadas en "${scope}".`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      return json({ created: false, error: msg });
    }
  }

  private async listDocumentPackages(user: RequestUser): Promise<string> {
    const packages = await this.documentPackages.list();
    if (packages.length === 0)
      return json({
        count: 0,
        packages: [],
        note: 'No hay paquetes de plantillas configurados en el despacho.',
      });
    return json({
      count: packages.length,
      packages: packages.map((p) => ({
        id: p.id,
        name: p.name,
        templateIds: p.templateIds ?? [],
        templateCount: (p.templateIds ?? []).length,
      })),
    });
  }

  private async listDocumentFolders(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        found: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    }

    const folders = await this.folders.list(user, FolderKind.DOCUMENT, matter.id);
    if (folders.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        folders: [],
        note: 'No hay carpetas personalizadas en este expediente. Los documentos se guardarán en la raíz.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      count: folders.length,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId ?? null,
        kind: f.kind,
      })),
      note: 'Árbol de carpetas del expediente. Usa parentId para reconstruir la jerarquía.',
    });
  }

  private async createDocumentFolder(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const name = str(input, 'name');

    if (!matterReference) {
      return json({ error: 'Falta la referencia del expediente.' });
    }
    if (!name || name.length < 1) {
      return json({ error: 'El nombre de la carpeta es obligatorio (mínimo 1 carácter).' });
    }

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true },
    });
    if (!matter) {
      return json({
        created: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha creado la carpeta.`,
      });
    }

    const parentFolderId = str(input, 'parentFolderId');

    try {
      const folder = await this.folders.create(user, {
        kind: FolderKind.DOCUMENT,
        matterId: matter.id,
        parentId: parentFolderId ?? undefined,
        name: name.slice(0, 200),
      });

      return json({
        created: true,
        folderId: folder.id,
        name: folder.name,
        matter: matterReference,
        kind: 'DOCUMENT',
        parentFolderId: folder.parentId ?? null,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('notInFirm')) {
        return json({
          created: false,
          error: 'Expediente no encontrado o no accesible.',
        });
      }
      if (msg.includes('parentMismatch')) {
        return json({
          created: false,
          error: 'La carpeta padre no es compatible (diferente expediente o tipo).',
        });
      }
      return json({
        created: false,
        error: msg,
      });
    }
  }

  private async updateChecklistItem(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const itemId = str(input, 'itemId');
    if (!itemId) {
      return json({ error: 'El ID del ítem es obligatorio.' });
    }

    const status = str(input, 'status');
    if (status && !['PENDING', 'UPLOADED', 'NA'].includes(status)) {
      return json({
        error: 'Estado no válido. Usa: PENDING, UPLOADED o NA.',
      });
    }

    const documentId = input.documentId === null ? null : str(input, 'documentId');
    if (
      input.documentId !== undefined &&
      typeof input.documentId !== 'string' &&
      input.documentId !== null
    ) {
      return json({ error: 'documentId debe ser un string o null.' });
    }

    try {
      const updated = await this.presentations.updateItem(user, itemId, {
        status: status as any,
        documentId,
      });
      if (!updated) return json({ updated: false, error: 'No se encontró el ítem del checklist.' });

      return json({
        updated: true,
        itemId: updated.id,
        name: updated.name,
        status: updated.status,
        documentId: updated.documentId ?? null,
        required: updated.required,
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('itemNotFound')) {
        return json({
          error: `El ítem con ID ${itemId} no existe o no es accesible en tu despacho.`,
        });
      }
      if (message.includes('documentMismatch')) {
        return json({
          error: 'El documento no pertenece al mismo expediente del ítem.',
        });
      }
      throw e;
    }
  }

  private async linkDocumentToDataRoom(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const roomId = str(input, 'roomId');
    if (!roomId) {
      return json({ error: 'Falta el ID de la sala de datos.' });
    }

    const versionId = str(input, 'versionId');
    if (!versionId) {
      return json({ error: 'Falta el ID de la versión del documento a vincular.' });
    }

    const folderId = str(input, 'folderId');
    const name = str(input, 'name');

    try {
      const result = await this.dataRoom.linkDocument(user, roomId, {
        versionId,
        folderId: folderId || undefined,
        name: name ? name.slice(0, 200) : undefined,
      });

      return json({
        linked: true,
        roomId: result.id,
        roomName: result.name,
        documentCount: result.documents.length,
        note: `Documento vinculado exitosamente al data room. Total de documentos en la sala: ${result.documents.length}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('versionNotFound') || msg.includes('Version not found')) {
        return json({
          linked: false,
          error: `La versión del documento con ID ${versionId} no existe o no es accesible en tu despacho.`,
        });
      }
      if (msg.includes('folderNotFound') || msg.includes('Folder not found')) {
        return json({
          linked: false,
          error: `La carpeta con ID ${folderId} no existe o no pertenece a esta sala de datos.`,
        });
      }
      if (msg.includes('notFound') || msg.includes('DataRoom not found')) {
        return json({
          linked: false,
          error: 'La sala de datos no existe o no es accesible en tu despacho.',
        });
      }
      return json({ linked: false, error: msg });
    }
  }

  private async addDataRoomGroup(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const roomId = str(input, 'roomId');
    if (!roomId) return json({ error: 'Falta el ID de la sala de datos.' });

    const name = str(input, 'name');
    if (!name || name.length < 2) {
      return json({ error: 'El nombre del grupo es obligatorio (mínimo 2 caracteres).' });
    }
    if (name.length > 160) {
      return json({ error: 'El nombre del grupo no puede exceder 160 caracteres.' });
    }

    const folderIds = Array.isArray(input.folderIds)
      ? (input.folderIds as string[]).filter((id) => typeof id === 'string' && id.trim().length > 0)
      : [];

    const canDownload = typeof input.canDownload === 'boolean' ? input.canDownload : true;

    try {
      const result = await this.dataRoom.addGroup(user, roomId, {
        name: name.trim(),
        folderIds: folderIds.length > 0 ? folderIds : undefined,
        canDownload,
      });

      return json({
        created: true,
        groupName: name,
        folderCount: folderIds.length,
        canDownload,
        note: `Grupo de permisos "${name}" creado exitosamente. Los grants (enlaces externos) pueden adscribirse a este grupo para heredar sus permisos de carpetas y descarga.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          created: false,
          error: 'La sala de datos no existe o no es accesible en tu despacho.',
        });
      }
      return json({ created: false, error: msg });
    }
  }

  private async revokeDataRoomGrant(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const grantId = str(input, 'grantId');
    if (!grantId) {
      return json({ error: 'El ID del enlace de acceso es obligatorio.' });
    }

    try {
      const room = await this.dataRoom.revokeGrant(user, grantId);
      return json({
        revoked: true,
        grantId,
        roomId: room.id,
        roomName: room.name,
        note: `Enlace de acceso revocado exitosamente. El usuario externo ha perdido acceso a ${room.name}.`,
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound') || message.includes('grantNotFound')) {
        return json({
          revoked: false,
          error: `El enlace de acceso con ID ${grantId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async getDataRoomQuestions(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const roomId = str(input, 'roomId');
    if (!roomId) return json({ error: 'Falta el ID de la sala de datos.' });

    try {
      const questions = await this.dataRoom.listQuestions(user, roomId);
      if (questions.length === 0) {
        return json({
          found: true,
          roomId,
          count: 0,
          questions: [],
          note: 'No hay preguntas de due diligence en esta sala.',
        });
      }

      const pending = questions.filter((q) => q.status === 'PENDING').length;
      const answered = questions.filter((q) => q.status === 'ANSWERED').length;

      return json({
        found: true,
        roomId,
        count: questions.length,
        pending,
        answered,
        questions: questions.map((q) => ({
          id: q.id,
          askedByEmail: q.askedByEmail,
          body: q.body,
          answer: q.answer ?? null,
          status: q.status,
          documentId: q.documentId ?? null,
          folderId: q.folderId ?? null,
          createdAt: q.createdAt ? q.createdAt.toISOString().slice(0, 10) : null,
          answeredAt: q.answeredAt ? q.answeredAt.toISOString().slice(0, 10) : null,
        })),
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          found: false,
          error: `La sala de datos con ID ${roomId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async getDataRoomAccessLog(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const roomId = str(input, 'roomId');
    if (!roomId) return json({ error: 'Falta el ID de la sala de datos.' });

    try {
      const logs = await this.dataRoom.listAccessLog(user, roomId);
      if (logs.length === 0) {
        return json({
          found: true,
          roomId,
          count: 0,
          logs: [],
          note: 'No hay accesos registrados en esta sala de datos.',
        });
      }

      return json({
        found: true,
        roomId,
        count: logs.length,
        logs: logs.map((l) => ({
          id: l.id,
          actorEmail: l.actorEmail,
          action: l.action,
          targetId: l.targetId ?? null,
          ip: l.ip ?? null,
          timestamp: l.createdAt ? l.createdAt.toISOString().slice(0, 19).replace('T', ' ') : null,
        })),
        note: `Últimos ${logs.length} accesos registrados en la sala. Acciones: VIEW_ROOM, DOWNLOAD, QUESTION, etc.`,
      });
    } catch (e) {
      if ((e as Error).message?.includes('notFound')) {
        return json({
          found: false,
          error: `La sala de datos con ID ${roomId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async getTransactionParties(
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

    const overview = await this.deal.overview(user, matter.id);

    if (overview.parties.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        parties: [],
        note: 'No hay partes registradas en esta operación.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      count: overview.parties.length,
      parties: overview.parties.map((p) => ({
        id: p.id,
        name: p.name,
        side: p.side,
        role: p.role,
        organization: p.organization ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        isDistribution: p.isDistribution,
        notes: p.notes ?? null,
      })),
    });
  }

  private async addDisclosureSchedule(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const number = str(input, 'number');
    const title = str(input, 'title');
    const body = str(input, 'body');
    const repWarranty = str(input, 'repWarranty');
    const documentId = str(input, 'documentId');
    const status = str(input, 'status');

    if (!matterReference) {
      return json({ error: 'Falta la referencia del expediente de operación.' });
    }
    if (!number || number.length < 1) {
      return json({
        error: 'El número/código del schedule es obligatorio (máximo 40 caracteres).',
      });
    }
    if (!title || title.length < 1) {
      return json({ error: 'El título del schedule es obligatorio (máximo 300 caracteres).' });
    }
    if (!body || body.length < 1) {
      return json({
        error: 'La descripción del schedule es obligatoria (máximo 20000 caracteres).',
      });
    }
    if (status && !['DRAFT', 'AGREED'].includes(status)) {
      return json({
        error: 'Estado no válido. Elige uno de: DRAFT o AGREED.',
      });
    }

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        created: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha creado el disclosure schedule.`,
      });
    }

    try {
      const overview = await this.deal.addDisclosure(user, matter.id, {
        number: number.slice(0, 40),
        title: title.slice(0, 300),
        body: body.slice(0, 20000),
        repWarranty: repWarranty ? repWarranty.slice(0, 200) : undefined,
        documentId: documentId ? documentId.slice(0, 60) : undefined,
        status: status ?? 'DRAFT',
      });

      return json({
        created: true,
        matterReference: matter.reference,
        number,
        title,
        status: status ?? 'DRAFT',
        totalSchedules: overview.disclosureSchedules.length,
        note: `Disclosure schedule "${number}: ${title}" creado en estado ${status ?? 'DRAFT'}. Se han registrado ${overview.disclosureSchedules.length} schedules en la operación.`,
        overview: {
          disclosureSchedules: overview.disclosureSchedules.map((d) => ({
            number: d.number,
            title: d.title,
            status: d.status,
            repWarranty: d.repWarranty,
          })),
        },
      });
    } catch (error) {
      return json({
        created: false,
        error: `Error al crear el disclosure schedule: ${error instanceof Error ? error.message : 'Desconocido'}`,
      });
    }
  }

  private async addCorporateMinute(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'El ID de la sociedad es obligatorio.' });

    const title = str(input, 'title');
    if (!title || title.length < 2) {
      return json({ error: 'El título del acta es obligatorio (mínimo 2 caracteres).' });
    }

    const meetingDateRaw = str(input, 'meetingDate');
    if (!meetingDateRaw) {
      return json({ error: 'La fecha de la junta es obligatoria (formato YYYY-MM-DD).' });
    }
    const meetingDate = new Date(meetingDateRaw);
    if (Number.isNaN(meetingDate.getTime())) {
      return json({ error: `Fecha no válida: ${meetingDateRaw}. Usa el formato YYYY-MM-DD.` });
    }

    const body = typeof input.body === 'string' ? input.body : '';
    if (!body.trim() || body.trim().length === 0) {
      return json({ error: 'El cuerpo del acta es obligatorio (mínimo 1 carácter).' });
    }
    if (body.length > 20000) {
      return json({ error: 'El cuerpo del acta no puede exceder 20000 caracteres.' });
    }

    const kindRaw = str(input, 'kind');
    const kind = kindRaw === 'BOARD' || kindRaw === 'OTHER' ? kindRaw : 'GENERAL_MEETING';

    try {
      const overview = await this.companySecretary.addMinute(user, clientId, {
        kind,
        title: title.slice(0, 200),
        meetingDate: meetingDateRaw,
        body,
      });
      return json({
        created: true,
        clientId,
        minute: {
          kind,
          title: title.slice(0, 200),
          meetingDate: meetingDateRaw,
          bodyLength: body.length,
        },
        totalMinutes: overview.minutes.length,
        message: `Acta de ${kind === 'GENERAL_MEETING' ? 'junta general' : kind === 'BOARD' ? 'junta directiva' : 'asamblea'} "${title}" registrada exitosamente. Total de actas en la sociedad: ${overview.minutes.length}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          created: false,
          error: 'La sociedad no existe o no es accesible en tu despacho.',
        });
      }
      return json({
        created: false,
        error: msg,
      });
    }
  }

  private async assignMatterLawyer(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const lawyerId = str(input, 'lawyerId');

    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        assigned: false,
        note: `No existe expediente con referencia ${matterReference}.`,
      });
    }

    const lawyerIdToAssign = lawyerId || null;

    try {
      const result = await this.matters.assignLawyer(user, matter.id, lawyerIdToAssign);
      const lawyerName = result.lawyer?.fullName ?? '(sin asignar)';
      return json({
        assigned: true,
        matterReference: result.reference,
        lawyer: lawyerName,
        message: `Letrado responsable del expediente ${result.reference} actualizado a: ${lawyerName}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('ForbiddenException') || msg.includes('Admin')) {
        return json({
          assigned: false,
          error: 'Solo el administrador del despacho puede asignar letrados.',
        });
      }
      if (msg.includes('invalid') || msg.includes('Invalid')) {
        return json({
          assigned: false,
          error: `Letrado no válido o sin permisos de LAWYER/FIRM_ADMIN en tu despacho.`,
        });
      }
      return json({
        assigned: false,
        error: msg,
      });
    }
  }

  private async getKycSummary(user: RequestUser): Promise<string> {
    const summary = await this.kyc.summary(user);
    return json({
      total: summary.total,
      byStatus: summary.byStatus,
      highRisk: summary.highRisk,
      pep: summary.pep,
    });
  }

  private async getTemplateDetail(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const templateId = str(input, 'templateId');
    if (!templateId) return json({ error: 'Falta el ID de la plantilla.' });

    const template = await this.templates.get(user, templateId);

    return json({
      found: true,
      id: template.id,
      name: template.name,
      description: template.description ?? null,
      body: template.body,
      tokens: template.tokens ?? [],
    });
  }

  private async getClosingChecklistDetail(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const checklistId = str(input, 'checklistId');
    if (!checklistId) {
      return json({ error: 'El ID del checklist es obligatorio.' });
    }

    try {
      const checklist = await this.closing.getOne(user, checklistId);

      return json({
        found: true,
        checklist: {
          id: checklist.id,
          matterId: checklist.matterId,
          title: checklist.title,
          signingDate: checklist.signingDate
            ? checklist.signingDate.toISOString().slice(0, 10)
            : null,
          closingDate: checklist.closingDate
            ? checklist.closingDate.toISOString().slice(0, 10)
            : null,
          longstopDate: checklist.longstopDate
            ? checklist.longstopDate.toISOString().slice(0, 10)
            : null,
          items: checklist.items.map((item) => ({
            id: item.id,
            category: item.category,
            title: item.title,
            detail: item.detail,
            status: item.status,
            phase: item.phase,
            inEscrow: item.inEscrow,
            releasedAt: item.releasedAt ? item.releasedAt.toISOString().slice(0, 10) : null,
            responsibleParty: item.responsibleParty,
            assigneeId: item.assigneeId,
            documentId: item.documentId,
            dueDate: item.dueDate ? item.dueDate.toISOString().slice(0, 10) : null,
            sortOrder: item.sortOrder,
          })),
        },
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('checklistNotFound')) {
        return json({
          found: false,
          error: `No existe checklist con ID ${checklistId} en tu despacho.`,
        });
      }
      return json({
        found: false,
        error: `No se pudo obtener el detalle del checklist: ${msg}`,
      });
    }
  }

  private async createClosingChecklist(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) {
      return json({ error: 'La referencia del expediente es obligatoria.' });
    }

    const title = str(input, 'title');
    if (!title || title.length < 2) {
      return json({ error: 'El título del checklist es obligatorio (mínimo 2 caracteres).' });
    }

    const templateKey = str(input, 'templateKey');

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        created: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha creado el checklist.`,
      });
    }

    try {
      const checklist = await this.closing.create(user, {
        matterId: matter.id,
        title: title.slice(0, 160),
        templateKey,
      });

      return json({
        created: true,
        checklistId: checklist.id,
        matter: matterReference,
        title: checklist.title,
        itemCount: checklist.items.length,
        template: templateKey ?? null,
        note: `Checklist de cierre creado exitosamente en ${matterReference}${templateKey ? ` con plantilla ${templateKey}` : ' (vacío)'}. Total de partidas precargadas: ${checklist.items.length}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('notInFirm')) {
        return json({
          created: false,
          error: `El expediente ${matterReference} no pertenece a tu despacho.`,
        });
      }
      return json({
        created: false,
        error: `No se pudo crear el checklist: ${msg}`,
      });
    }
  }

  private async updateClosingItem(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const itemId = str(input, 'itemId');
    if (!itemId) {
      return json({ error: 'El ID de la partida es obligatorio.' });
    }

    const status = str(input, 'status');
    if (status && !['PENDING', 'SATISFIED', 'WAIVED'].includes(status)) {
      return json({
        error: 'Estado no válido. Usa: PENDING, SATISFIED o WAIVED.',
      });
    }

    const category = str(input, 'category');
    if (
      category &&
      !['CONDITION_PRECEDENT', 'DELIVERABLE', 'SIGNATURE_PAGE', 'OTHER'].includes(category)
    ) {
      return json({
        error:
          'Categoría no válida. Elige una de: CONDITION_PRECEDENT, DELIVERABLE, SIGNATURE_PAGE, OTHER.',
      });
    }

    const title = str(input, 'title');
    if (title && title.length < 2) {
      return json({ error: 'El título debe tener al menos 2 caracteres.' });
    }

    const detail = str(input, 'detail');
    if (detail && detail.length > 2000) {
      return json({ error: 'El detalle no puede exceder 2000 caracteres.' });
    }

    const responsibleParty = str(input, 'responsibleParty');
    if (responsibleParty && responsibleParty.length > 120) {
      return json({ error: 'La parte responsable no puede exceder 120 caracteres.' });
    }

    const assigneeId = str(input, 'assigneeId');
    const documentId = str(input, 'documentId');

    const phaseRaw = str(input, 'phase');
    const phase = (Object.values(ClosingItemPhase) as string[]).includes(phaseRaw ?? '')
      ? (phaseRaw as ClosingItemPhase)
      : undefined;

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

    const inEscrow = typeof input.inEscrow === 'boolean' ? input.inEscrow : undefined;
    const sortOrder = typeof input.sortOrder === 'number' ? input.sortOrder : undefined;

    try {
      const updateDto: Record<string, unknown> = {};
      if (status) updateDto.status = status as ClosingItemStatus;
      if (category) updateDto.category = category as ClosingItemCategory;
      if (phase) updateDto.phase = phase;
      if (title !== undefined) updateDto.title = title.slice(0, 200);
      if (detail !== undefined) updateDto.detail = detail.slice(0, 2000);
      if (responsibleParty !== undefined) updateDto.responsibleParty = responsibleParty;
      if (assigneeId !== undefined) updateDto.assigneeId = assigneeId;
      if (documentId !== undefined) updateDto.documentId = documentId;
      if (dueDate !== undefined) updateDto.dueDate = dueDate;
      if (inEscrow !== undefined) updateDto.inEscrow = inEscrow;
      if (sortOrder !== undefined) updateDto.sortOrder = sortOrder;

      const checklist = await this.closing.updateItem(user, itemId, updateDto as never);

      const item = checklist.items.find((i) => i.id === itemId);
      if (!item) {
        return json({
          error: `No se encontró la partida ${itemId} en el checklist después de la actualización.`,
        });
      }

      return json({
        updated: true,
        checklistId: checklist.id,
        itemId: item.id,
        title: item.title,
        status: item.status,
        category: item.category,
        phase: item.phase ?? null,
        inEscrow: item.inEscrow,
        releasedAt: item.releasedAt ? item.releasedAt.toISOString().slice(0, 10) : null,
        dueDate: item.dueDate ? item.dueDate.toISOString().slice(0, 10) : null,
        note: `Partida actualizada en el checklist. Total de partidas: ${checklist.items.length}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound') || msg.includes('itemNotFound')) {
        return json({
          updated: false,
          error: `No existe partida con ID ${itemId} en tu despacho.`,
        });
      }
      if (msg.includes('notInFirm') || msg.includes('assigneeNotInFirm')) {
        return json({
          updated: false,
          error: 'El asignado o documento no pertenece a tu despacho.',
        });
      }
      return json({
        updated: false,
        error: `No se pudo actualizar la partida: ${msg}`,
      });
    }
  }

  private async getDataRoom(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const dataRoomId = str(input, 'dataRoomId');
    if (!dataRoomId) return json({ error: 'Falta el ID de la sala de datos.' });

    try {
      const room = await this.dataRoom.getOne(user, dataRoomId);

      return json({
        found: true,
        id: room.id,
        matterId: room.matterId,
        name: room.name,
        watermark: room.watermark,
        status: room.status,
        folderCount: room.folders.length,
        folders: room.folders.map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId ?? null,
          sortOrder: f.sortOrder,
        })),
        documentCount: room.documents.length,
        documents: room.documents.map((d) => ({
          id: d.id,
          name: d.name,
          folderId: d.folderId ?? null,
          mimeType: d.mimeType,
          sizeBytes: d.sizeBytes,
          createdAt: d.createdAt ? d.createdAt.toISOString().slice(0, 10) : null,
        })),
        groupCount: room.groups.length,
        groups: room.groups.map((g) => ({
          id: g.id,
          name: g.name,
          folderIds: g.folderIds ?? [],
          canDownload: g.canDownload,
        })),
        grantCount: room.grants.length,
        grants: room.grants.map((gr) => ({
          id: gr.id,
          email: gr.email,
          name: gr.name ?? null,
          role: gr.role ?? null,
          groupId: gr.groupId ?? null,
          canDownload: gr.canDownload,
          folderIds: gr.folderIds ?? [],
          expiresAt: gr.expiresAt ? gr.expiresAt.toISOString().slice(0, 10) : null,
          revokedAt: gr.revokedAt ? gr.revokedAt.toISOString().slice(0, 10) : null,
          lastAccessAt: gr.lastAccessAt ? gr.lastAccessAt.toISOString().slice(0, 19) : null,
          createdAt: gr.createdAt ? gr.createdAt.toISOString().slice(0, 10) : null,
        })),
      });
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('notFound')) {
        return json({
          found: false,
          error: `La sala de datos con ID ${dataRoomId} no existe o no es accesible en tu despacho.`,
        });
      }
      throw e;
    }
  }

  private async createDataRoom(user: RequestUser, input: Record<string, unknown>): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) {
      return json({ error: 'La referencia del expediente es obligatoria.' });
    }

    const name = str(input, 'name');
    if (!name || name.length < 2) {
      return json({ error: 'El nombre de la sala es obligatorio (mínimo 2 caracteres).' });
    }
    if (name.length > 160) {
      return json({ error: 'El nombre de la sala no puede exceder 160 caracteres.' });
    }

    const watermark = typeof input.watermark === 'boolean' ? input.watermark : true;

    try {
      const matter = await this.prisma.matter.findFirst({
        where: { tenantId: user.tenantId, reference: matterReference },
        select: { id: true },
      });
      if (!matter) {
        return json({
          created: false,
          error: `No existe expediente con referencia ${matterReference}; no se ha creado el data room.`,
        });
      }

      const room = await this.dataRoom.create(user, {
        matterId: matter.id,
        name: name.trim(),
        watermark,
      });

      return json({
        created: true,
        roomId: room.id,
        name: room.name,
        watermark: room.watermark,
        matterReference,
        note: `Data room "${room.name}" creado exitosamente en el expediente ${matterReference}. Ahora puedes añadir documentos, crear grupos de permisos y generar enlaces para terceros.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      return json({ created: false, error: msg });
    }
  }

  private async addDataRoomFolder(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const roomId = str(input, 'roomId');
    if (!roomId) return json({ error: 'Falta el ID del data room.' });

    const name = str(input, 'name');
    if (!name || name.length < 1) {
      return json({ error: 'El nombre de la carpeta es obligatorio (mínimo 1 carácter).' });
    }
    if (name.length > 160) {
      return json({ error: 'El nombre de la carpeta no puede exceder 160 caracteres.' });
    }

    const parentId = str(input, 'parentId');

    try {
      const result = await this.dataRoom.addFolder(user, roomId, {
        name: name.trim(),
        parentId: parentId || undefined,
      });

      return json({
        created: true,
        folderName: name,
        roomId,
        parentId: parentId || null,
        note: `Carpeta "${name}" creada exitosamente en el data room. Puedes anidar más carpetas bajo esta o vincular documentos.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          created: false,
          error: 'El data room no existe o no es accesible en tu despacho.',
        });
      }
      return json({ created: false, error: msg });
    }
  }

  private async getDisclosureSchedules(
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

    const overview = await this.deal.overview(user, matter.id);

    if (overview.disclosureSchedules.length === 0) {
      return json({
        found: true,
        matter: matterReference,
        count: 0,
        schedules: [],
        note: 'No hay disclosure schedules registrados en esta operación.',
      });
    }

    return json({
      found: true,
      matter: matterReference,
      count: overview.disclosureSchedules.length,
      schedules: overview.disclosureSchedules.map((d) => ({
        id: d.id,
        number: d.number,
        repWarranty: d.repWarranty ?? null,
        title: d.title,
        body: d.body ?? null,
        status: d.status,
        hasDocument: d.documentId !== null && d.documentId !== undefined,
        documentId: d.documentId ?? null,
      })),
    });
  }

  private async addRegistryFiling(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    if (!matterReference) {
      return json({ error: 'Falta la referencia del expediente de operación.' });
    }

    const title = str(input, 'title');
    if (!title || title.length < 1) {
      return json({
        error: 'El título de la presentación registral es obligatorio (1-200 caracteres).',
      });
    }

    const registry = str(input, 'registry');
    if (
      registry &&
      ![
        'REGISTRO_MERCANTIL',
        'REGISTRO_PROPIEDAD',
        'INDICE_UNICO_NOTARIAL',
        'NOTARIA',
        'REGISTRO_TITULOS_RD',
        'CAMARA_COMERCIO_RD',
        'OTHER',
      ].includes(registry)
    ) {
      return json({
        error:
          'Tipo de registro no válido. Elige uno de: REGISTRO_MERCANTIL, REGISTRO_PROPIEDAD, INDICE_UNICO_NOTARIAL, NOTARIA, REGISTRO_TITULOS_RD, CAMARA_COMERCIO_RD, OTHER.',
      });
    }

    const referenceCode = str(input, 'referenceCode');
    const documentId = str(input, 'documentId');
    const notes = str(input, 'notes');

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({
        created: false,
        note: `No existe expediente con referencia ${matterReference}; no se ha creado la presentación registral.`,
      });
    }

    try {
      const overview = await this.deal.addFiling(user, matter.id, {
        registry: registry ?? 'OTHER',
        title: title.slice(0, 200),
        referenceCode: referenceCode ? referenceCode.slice(0, 120) : undefined,
        documentId: documentId ? documentId.slice(0, 60) : undefined,
        notes: notes ? notes.slice(0, 2000) : undefined,
      });

      return json({
        created: true,
        matterReference: matter.reference,
        registry: registry ?? 'OTHER',
        title,
        status: 'PENDING',
        referenceCode: referenceCode ?? null,
        totalFilings: overview.registryFilings.length,
        note: `Presentación registral "${title}" creada en la operación (tipo: ${registry ?? 'OTHER'}, estado: PENDING). Se han registrado ${overview.registryFilings.length} presentaciones en el expediente.`,
        overview: {
          registryFilings: overview.registryFilings.map((f) => ({
            registry: f.registry,
            title: f.title,
            referenceCode: f.referenceCode,
            status: f.status,
          })),
        },
      });
    } catch (error) {
      return json({
        created: false,
        error: `Error al crear la presentación registral: ${error instanceof Error ? error.message : 'Desconocido'}`,
      });
    }
  }

  private async addShareTransfer(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'El ID de la sociedad es obligatorio.' });

    const fromName = str(input, 'fromName');
    const toName = str(input, 'toName');
    if (!toName || toName.length < 1) {
      return json({ error: 'El nombre del receptor es obligatorio (mínimo 1 carácter).' });
    }

    const unitsRaw = input.units;
    const units =
      typeof unitsRaw === 'number' && Number.isFinite(unitsRaw) ? Math.floor(unitsRaw) : undefined;
    if (units === undefined || units < 1) {
      return json({
        error: 'Las unidades deben ser un número entero >= 1.',
      });
    }

    const date = str(input, 'date');
    if (!date) {
      return json({ error: 'La fecha de transmisión es obligatoria (formato YYYY-MM-DD).' });
    }

    const note = str(input, 'note');

    try {
      const overview = await this.companySecretary.addTransfer(user, clientId, {
        fromName: fromName ? fromName.slice(0, 200) : undefined,
        toName: toName.slice(0, 200),
        units,
        date,
        note: note ? note.slice(0, 2000) : undefined,
      });
      return json({
        created: true,
        clientId,
        transfer: {
          fromName: fromName ? fromName.slice(0, 200) : null,
          toName: toName.slice(0, 200),
          units,
          date,
          note: note ? note.slice(0, 2000) : null,
        },
        totalUnits: overview.totalUnits,
        transferCount: overview.transfers.length,
        message: `Transmisión de ${units} unidad(es) de ${fromName ? fromName : '(aportación)'} a "${toName}" registrada exitosamente el ${date}. Total de unidades en la sociedad: ${overview.totalUnits}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          created: false,
          error: 'La sociedad no existe o no es accesible en tu despacho.',
        });
      }
      return json({
        created: false,
        error: msg,
      });
    }
  }

  private async addRegistryObligation(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const clientId = str(input, 'clientId');
    if (!clientId) return json({ error: 'El ID de la sociedad es obligatorio.' });

    const title = str(input, 'title');
    if (!title || title.length < 2) {
      return json({ error: 'El título de la obligación es obligatorio (mínimo 2 caracteres).' });
    }

    const dueDateRaw = str(input, 'dueDate');
    if (!dueDateRaw) {
      return json({ error: 'La fecha de vencimiento es obligatoria (formato YYYY-MM-DD).' });
    }
    const dueDate = new Date(dueDateRaw);
    if (Number.isNaN(dueDate.getTime())) {
      return json({ error: `Fecha no válida: ${dueDateRaw}. Usa el formato YYYY-MM-DD.` });
    }

    const registry = str(input, 'registry');
    const referenceCode = str(input, 'referenceCode');
    const recurrenceRaw = str(input, 'recurrence');
    const recurrence = recurrenceRaw === 'ONCE' ? 'ONCE' : 'ANNUAL';

    try {
      const overview = await this.companySecretary.addObligation(user, clientId, {
        registry: registry as any,
        title: title.slice(0, 200),
        referenceCode: referenceCode ? referenceCode.slice(0, 120) : undefined,
        dueDate: dueDateRaw,
        recurrence,
      });
      return json({
        created: true,
        clientId,
        obligation: {
          registry: registry ?? null,
          title: title.slice(0, 200),
          referenceCode: referenceCode ? referenceCode.slice(0, 120) : null,
          dueDate: dueDateRaw,
          recurrence,
        },
        totalObligations: overview.obligations.length,
        message: `Obligación registral "${title}" registrada exitosamente con vencimiento ${dueDateRaw} y recurrencia ${recurrence === 'ANNUAL' ? 'anual' : 'única'}. Total de obligaciones en la sociedad: ${overview.obligations.length}.`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          created: false,
          error: 'La sociedad no existe o no es accesible en tu despacho.',
        });
      }
      return json({
        created: false,
        error: msg,
      });
    }
  }

  private async updateRegistryObligation(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const obligationId = str(input, 'obligationId');
    if (!obligationId) return json({ error: 'El ID de la obligación es obligatorio.' });

    const registry = str(input, 'registry');
    const registryValid = [
      'REGISTRO_MERCANTIL',
      'REGISTRO_PROPIEDAD',
      'INDICE_UNICO_NOTARIAL',
      'NOTARIA',
      'REGISTRO_TITULOS_RD',
      'CAMARA_COMERCIO_RD',
      'OTHER',
    ];
    if (registry && !registryValid.includes(registry)) {
      return json({ error: `Tipo de registro no válido: ${registry}` });
    }

    const title = str(input, 'title');
    if (title && title.length < 2) {
      return json({ error: 'El título debe tener al menos 2 caracteres.' });
    }

    const referenceCode = str(input, 'referenceCode');
    if (referenceCode && referenceCode.length > 120) {
      return json({ error: 'El código de referencia no puede exceder 120 caracteres.' });
    }

    const dueDateRaw = str(input, 'dueDate');
    let dueDate: Date | undefined;
    if (dueDateRaw) {
      dueDate = new Date(dueDateRaw);
      if (Number.isNaN(dueDate.getTime())) {
        return json({ error: `Fecha no válida: ${dueDateRaw}. Usa el formato YYYY-MM-DD.` });
      }
    }

    const recurrence = str(input, 'recurrence');
    if (recurrence && !['NONE', 'ANNUAL'].includes(recurrence)) {
      return json({ error: `Recurrencia no válida: ${recurrence}. Debe ser NONE o ANNUAL.` });
    }

    const status = str(input, 'status');
    if (status && !['PENDING', 'FILED'].includes(status)) {
      return json({ error: `Estado no válido: ${status}. Debe ser PENDING o FILED.` });
    }

    try {
      const overview = await this.companySecretary.updateObligation(user, obligationId, {
        ...(registry ? { registry } : {}),
        ...(title ? { title } : {}),
        ...(referenceCode !== undefined ? { referenceCode } : {}),
        ...(dueDateRaw ? { dueDate: dueDateRaw } : {}),
        ...(recurrence ? { recurrence } : {}),
        ...(status ? { status } : {}),
      });
      return json({
        updated: true,
        obligationId,
        obligation: {
          title: title || '(sin cambios)',
          registry: registry || '(sin cambios)',
          status: status || '(sin cambios)',
          dueDate: dueDateRaw || '(sin cambios)',
          recurrence: recurrence || '(sin cambios)',
        },
        totalObligations: overview.obligations.length,
        message: `Obligación registral actualizada exitosamente. Total de obligaciones en la sociedad: ${overview.obligations.length}.${status === 'FILED' && recurrence === 'ANNUAL' ? ' Se ha creado automáticamente la obligación del próximo año.' : ''}`,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('notFound')) {
        return json({
          updated: false,
          error: 'La obligación no existe o no es accesible en tu despacho.',
        });
      }
      return json({
        updated: false,
        error: msg,
      });
    }
  }

  /**
   * Revisa un contrato del expediente contra un playbook del despacho. Ejecuta la pasada COMPLETA de
   * forma síncrona (variante `runReviewAndWait`; el informe queda igualmente persistido y exportable a
   * PDF desde Playbooks) y devuelve el informe por regla con citas verificadas, para que el modelo
   * resuma las desviaciones citando los pasajes. Las citas ya vienen VERIFICADAS contra el texto real
   * (locateQuote en servidor): el modelo no debe parafrasearlas como si fueran otra cosa.
   */
  private async runPlaybookReview(
    user: RequestUser,
    input: Record<string, unknown>,
  ): Promise<string> {
    const matterReference = str(input, 'matterReference');
    const documentName = str(input, 'documentName');
    const playbookName = str(input, 'playbookName');
    if (!matterReference) return json({ error: 'Falta la referencia del expediente.' });
    if (!documentName) return json({ error: 'Falta el nombre del documento a revisar.' });

    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference: matterReference },
      select: { id: true, reference: true },
    });
    if (!matter) {
      return json({ error: `No existe expediente con referencia ${matterReference}.` });
    }

    const document = await this.prisma.document.findFirst({
      where: {
        tenantId: user.tenantId,
        matterId: matter.id,
        name: { contains: documentName, mode: 'insensitive' },
      },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!document) {
      return json({
        error: `No hay ningún documento que coincida con "${documentName}" en ${matter.reference}.`,
      });
    }

    const candidates = await this.prisma.playbook.findMany({
      where: {
        tenantId: user.tenantId,
        ...(playbookName ? { name: { contains: playbookName, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 5,
    });
    if (candidates.length === 0) {
      return json({
        error: playbookName
          ? `No hay ningún playbook que coincida con "${playbookName}".`
          : 'El despacho aún no tiene playbooks de revisión (créalos en Playbooks).',
      });
    }
    if (candidates.length > 1) {
      return json({
        error: 'Hay varios playbooks posibles; pide al usuario que concrete cuál.',
        playbooks: candidates.map((p) => p.name),
      });
    }

    const review = await this.playbookReviews.runReviewAndWait(user, {
      playbookId: candidates[0]!.id,
      documentId: document.id,
    });
    const done = review.findings.filter((f) => f.status === 'DONE');
    return json({
      reviewId: review.id,
      playbook: review.playbookName,
      document: review.documentName,
      matterReference: matter.reference,
      summary: {
        compliant: done.filter((f) => f.outcome === 'COMPLIANT').length,
        deviations: done.filter((f) => f.outcome === 'DEVIATION').length,
        dealBreakers: done.filter((f) => f.dealBreaker).length,
        missing: done.filter((f) => f.outcome === 'MISSING').length,
        unresolved: review.findings.length - done.length,
      },
      findings: review.findings.map((f) => ({
        topic: f.topic,
        severity: f.severity,
        status: f.status,
        outcome: f.outcome,
        dealBreaker: f.dealBreaker,
        analysis: f.analysis,
        quote: f.snippet,
        suggestedText: f.outcome && f.outcome !== 'COMPLIANT' ? (f.preferredText ?? null) : null,
        confidence: f.confidence,
        error: f.error,
      })),
      note:
        'Informe guardado: consultable y exportable a PDF en IA › Playbooks. Resume las desviaciones ' +
        '(deal-breakers primero) citando textualmente "quote" y ofrece la redacción sugerida.',
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
  if (inv.name === 'create_presentation_type') {
    return `Crear el tipo de presentación "${str(inv.input, 'name') ?? ''}" (sector ${str(inv.input, 'sector') ?? ''})`;
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
  const W3: Record<string, string> = {
    convert_lead_to_client: 'Convertir el lead en cliente (y opcionalmente abrir expediente)',
    update_lead: 'Actualizar el lead',
    upsert_client_kyc: 'Crear o actualizar el perfil KYC del cliente',
    confirm_appointment: 'Confirmar la cita',
    cancel_appointment: 'Cancelar la cita (se notificará al cliente)',
    create_data_room_grant: 'Generar un enlace de acceso externo al data room',
    answer_data_room_question: 'Responder una pregunta de due diligence',
    add_transaction_party: 'Añadir una parte a la operación',
    update_transaction_party: 'Actualizar una parte de la operación',
    add_transaction_milestone: 'Añadir un hito a la operación',
    update_transaction_milestone: 'Actualizar un hito de la operación',
    update_disclosure_schedule: 'Actualizar un disclosure schedule',
    update_registry_filing: 'Actualizar una presentación registral',
    save_engagement_letter: 'Guardar la hoja de encargo',
    add_shareholder: 'Añadir un accionista',
    add_firm_holiday: 'Añadir un día festivo al calendario del despacho',
  };
  const w3 = W3[inv.name];
  if (w3) return w3;
  const W4: Record<string, string> = {
    change_matter_status: `Cambiar el estado del expediente ${ref ?? ''} a "${str(inv.input, 'status') ?? ''}"`,
    update_client_info: 'Actualizar los datos del cliente',
    create_lead: 'Dar de alta un lead en el embudo',
    reassign_task: 'Reasignar la tarea a otro letrado',
    create_saved_view: 'Guardar una vista de filtros',
    create_document_folder: `Crear una carpeta de documentos${ref ? ` en ${ref}` : ''}`,
    update_checklist_item: 'Actualizar un ítem del checklist',
    link_document_to_data_room: 'Vincular un documento al data room',
    add_data_room_group: 'Crear un grupo de permisos en el data room',
    revoke_data_room_grant: 'Revocar un acceso externo al data room',
    add_disclosure_schedule: 'Añadir un disclosure schedule a la operación',
    add_corporate_minute: 'Registrar un acta de junta',
  };
  const w4 = W4[inv.name];
  if (w4) return w4;
  if (inv.name === 'assign_matter_lawyer') {
    const ref = str(inv.input, 'matterReference');
    const lawyerId = str(inv.input, 'lawyerId');
    return `Asignar el letrado responsable del expediente ${ref ?? ''} a ${lawyerId ? `el letrado ${lawyerId}` : '(sin asignar)'}`;
  }
  if (inv.name === 'create_closing_checklist') {
    const ref = str(inv.input, 'matterReference');
    const title = str(inv.input, 'title');
    const tpl = str(inv.input, 'templateKey');
    return `Crear el checklist de cierre "${title}"${ref ? ` en ${ref}` : ''}${tpl ? ` (plantilla: ${tpl})` : ' (vacío)'}`;
  }
  if (inv.name === 'update_closing_item') {
    const itemId = str(inv.input, 'itemId');
    const status = str(inv.input, 'status');
    return `Actualizar la partida ${itemId}${status ? ` a estado "${status}"` : ''}`;
  }
  if (inv.name === 'create_data_room') {
    return `Crear el data room "${str(inv.input, 'name') ?? ''}" en ${str(inv.input, 'matterReference') ?? 'el expediente'}`;
  }
  if (inv.name === 'add_data_room_folder')
    return `Crear una carpeta "${str(inv.input, 'name') ?? ''}" en el data room`;
  if (inv.name === 'add_registry_filing') {
    return `Registrar una presentación registral "${str(inv.input, 'title') ?? ''}" en ${str(inv.input, 'matterReference') ?? 'la operación'}`;
  }
  if (inv.name === 'add_share_transfer') {
    const fromName = str(inv.input, 'fromName');
    const toName = str(inv.input, 'toName');
    const units = inv.input.units;
    const date = str(inv.input, 'date');
    return `Registrar una transmisión de ${units} unidad(es) de ${fromName || '(aportación)'} a "${toName}"${date ? ` el ${date}` : ''}`;
  }
  if (inv.name === 'add_registry_obligation') {
    return `Registrar la obligación registral "${str(inv.input, 'title') ?? ''}" con vencimiento ${str(inv.input, 'dueDate') ?? '(fecha)'}`;
  }
  if (inv.name === 'update_registry_obligation')
    return `Actualizar la obligación registral${str(inv.input, 'title') ? ` "${str(inv.input, 'title')}"` : ''} a estado "${str(inv.input, 'status') ?? ''}"`;
  if (inv.name === 'run_playbook_review') {
    const docName = str(inv.input, 'documentName') ?? '(documento)';
    const pb = str(inv.input, 'playbookName');
    return `Revisar el contrato "${docName}" de ${str(inv.input, 'matterReference') ?? 'el expediente'} contra ${pb ? `el playbook "${pb}"` : 'el playbook del despacho'} (consume IA y guarda el informe)`;
  }
  return inv.name;
}
