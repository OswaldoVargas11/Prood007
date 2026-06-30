/** Tipos de dominio del frontend, alineados con el contrato del backend (apps/api). */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type MatterStatus = 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'CLOSED' | 'ARCHIVED';

export interface Matter {
  id: string;
  reference: string;
  title: string;
  type: string;
  status: MatterStatus;
  clientId: string;
  lawyerId: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Partes y procedimiento (todo opcional; null si no se rellenó). */
  opposingParty: string | null;
  opposingPartyTaxId: string | null;
  opposingCounsel: string | null;
  court: string | null;
  caseNumber: string | null;
  proceduralPhase: string | null;
  /** Incluidos en `GET /matters` (lista): cliente y letrado responsable. */
  client?: { id: string; name: string };
  lawyer?: { id: string; fullName: string } | null;
}

/** `GET /matters/:id` incluye un extracto del cliente y el letrado responsable. */
export interface MatterDetail extends Matter {
  client: { id: string; name: string; taxId: string };
  budgetAmount: string | null;
  budgetConsumed: number;
}

/** Letrado asignable a un expediente (`GET /matters/assignees`, solo admin). */
export interface Assignee {
  id: string;
  fullName: string;
}

/** Equipo del expediente (`GET /matters/:id/team`): líder + letrados adicionales asignados. */
export interface MatterTeam {
  lead: { id: string; fullName: string } | null;
  members: { id: string; fullName: string }[];
}

export interface Client {
  id: string;
  name: string;
  taxId: string;
  taxIdKind: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  userId?: string | null;
  createdAt: string;
  _count?: { matters: number };
  /** Saldo agregado (apuntes aprobados de todos sus expedientes). Incluido en `GET /clients`. */
  balance?: string;
  /** RGPD/Ley 172-13: fecha de anonimización del titular (PII borrada). `null`/ausente si activo. */
  anonymizedAt?: string | null;
}

/** Respuesta de `POST /clients/:id/anonymize`: PII borrada, expediente y facturas conservados. */
export interface AnonymizeResult {
  anonymizedAt: string;
  portalUserAnonymized: boolean;
  preserved: { matters: number; invoices: number };
}

/** Respuesta de `GET /clients` (página + moneda del tenant para formatear el saldo). */
export interface ClientsPage extends Paginated<Client> {
  currency: string;
}

/** Importe agregado en una moneda concreta (desglose multi-moneda). */
export interface MoneyByCurrency {
  currency: string;
  amount: string;
}

/** Series para los gráficos del panel (`GET /dashboard/charts`). */
export interface ChartSlice {
  label: string;
  value: number;
}
export interface DashboardCharts {
  mattersByStatus: ChartSlice[];
  mattersBySector: ChartSlice[];
  tasks: ChartSlice[];
  invoices: ChartSlice[];
  workloadByLawyer: ChartSlice[];
  checklist: { done: number; pending: number; total: number };
}

export interface DashboardSummary {
  /** Moneda principal del despacho (la del gráfico de tendencia y el desglose primero). */
  currency: string;
  kpis: {
    activeMatters: number;
    totalMatters: number;
    totalClients: number;
    openTasks: number;
    upcomingDeadlines: number;
    urgentDeadlines: number;
    pendingReviews: number;
    /** Facturado este mes, DESGLOSADO por moneda (principal primero). */
    billableThisMonth: MoneyByCurrency[];
    /** Pendiente de cobro, DESGLOSADO por moneda (principal primero). */
    outstanding: MoneyByCurrency[];
  };
  /** true si hay facturas en monedas distintas de la principal (el gráfico solo refleja la principal). */
  hasOtherCurrencies: boolean;
  revenueByMonth: { month: string; total: string }[];
  deadlines: {
    taskId: string;
    title: string;
    deadlineType: string | null;
    dueDate: string | null;
    matterId: string | null;
    reference: string | null;
    clientName: string | null;
  }[];
  urgentCount: number;
  recentActivity: {
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    actor: string | null;
  }[];
}

/** Importación de clientes (migración CSV): fila del dry-run. */
export interface ImportPreviewRow {
  line: number;
  name: string;
  taxId: string;
  status: 'ok' | 'duplicate' | 'error';
  kind?: string;
  message?: string;
}
export interface ImportPreview {
  summary: { total: number; ok: number; duplicates: number; errors: number };
  rows: ImportPreviewRow[];
}
export interface ImportResult {
  created: number;
  skippedDuplicates: number;
  errors: number;
  failed: { line: number; message: string }[];
}

/** Captación / mini-CRM. */
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  subject: string | null;
  notes: string | null;
  source: string;
  status: LeadStatus;
  estimatedValue: string | null;
  convertedClientId: string | null;
  convertedMatterId: string | null;
  createdAt: string;
  assignedTo?: { id: string; fullName: string } | null;
}

export interface MatterEmail {
  id: string;
  direction: 'IN' | 'OUT';
  fromAddr: string;
  toAddr: string;
  subject: string | null;
  snippet: string | null;
  body?: string | null;
  sentAt: string;
}

export interface RecentEmail {
  externalId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface Message {
  id: string;
  matterId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string };
  /** Reacciones tipo red social: { emoji: [userId, …] }. */
  reactions?: Record<string, string[]> | null;
  attachmentDocumentId?: string | null;
  /** Documento del expediente adjunto (resuelto por el backend). */
  attachment?: { id: string; name: string } | null;
}

/** Acuse de lectura del chat: hasta cuándo ha leído cada participante. */
export interface ChatRead {
  userId: string;
  fullName: string | null;
  lastReadAt: string;
}

/** Conversación de la bandeja (`GET /messages/conversations`). */
export interface ChatConversation {
  matterId: string;
  reference: string;
  title: string;
  last: { body: string; createdAt: string; authorName: string } | null;
  unread: number;
}

// ── Mensajería interna (chat social del staff): directorio + DM 1:1 + canal «General» ──

/** Usuario del despacho en el directorio del dock (`GET /messaging/directory`). */
export interface DirectoryUser {
  id: string;
  fullName: string;
  isSelf: boolean;
}

/** Conversación del dock (`GET /messaging/conversations`): canal «General» o DM 1:1. */
export interface MessagingConversation {
  id: string;
  kind: 'DIRECT' | 'CHANNEL';
  title: string | null;
  peer: { id: string; fullName: string } | null;
  last: { body: string; createdAt: string; authorId: string } | null;
  unread: number;
}

/** Mensaje de una conversación interna (DM o canal). */
export interface ConversationMessage {
  id: string;
  conversationId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string };
  reactions?: Record<string, string[]> | null;
  attachmentDocumentId?: string | null;
  attachment?: { id: string; name: string } | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export type LedgerEntryType =
  | 'PROVISION'
  | 'DISBURSEMENT'
  | 'TIME_FEE'
  | 'FEE'
  | 'INVOICE'
  | 'PAYMENT'
  | 'ADJUSTMENT';

export type ApprovalStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';

export interface LedgerEntry {
  id: string;
  matterId: string;
  type: LedgerEntryType;
  description: string;
  amount: string;
  currency: string;
  invoiceId: string | null;
  approvalStatus: ApprovalStatus;
  occurredAt: string;
  createdAt: string;
  /** Hay justificante (foto del ticket/tasa) adjunto al suplido. */
  hasReceipt?: boolean;
  receiptName?: string | null;
}

export interface MatterLedger {
  matterId: string;
  currency: string;
  balance: string;
  entries: LedgerEntry[];
}

/** Ficha de tiempo con su honorario calculado y el expediente al que pertenece. */
export interface TimeEntryItem {
  id: string;
  description: string;
  minutes: number;
  hourlyRate: string;
  workedAt: string;
  billed: boolean;
  fee: string;
  matter: { id: string; reference: string; title: string } | null;
}

/** Respuesta de `GET /ledger/time`: fichas + totales (minutos y honorarios). */
export interface TimeSummary {
  entries: TimeEntryItem[];
  totalMinutes: number;
  totalFee: string;
  currency: string;
}

/** Estado del cobro online para la jurisdicción del tenant (`GET /payments/config`). */
export interface PaymentConfig {
  jurisdiction: 'es' | 'do';
  method: 'MANUAL' | 'STRIPE';
  onlineEnabled: boolean;
}

/** Estado de la conexión Stripe del despacho (`GET /payments/connect/status`). */
export interface StripeConnectStatus {
  connected: boolean;
  onlineEnabled: boolean;
  detailsSubmitted?: boolean;
  accountId?: string;
}

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'SENT'
  | 'PARTIAL'
  | 'OVERDUE'
  | 'PAID'
  | 'CANCELLED';

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  currency: string;
  taxableBase: string;
  taxAmount: string;
  withholdingAmount: string;
  total: string;
  amountPaid?: string;
  complianceFormat: 'VERIFACTU' | 'ECF' | null;
  complianceRecord: Record<string, unknown> | null;
  recordHash: string | null;
  previousRecordHash: string | null;
  // Estado de la transmisión del e-CF a la DGII (RD).
  ecfStatus?: EcfStatus;
  ecfTrackId?: string | null;
  ecfStatusDetail?: string | null;
  lines: InvoiceLine[];
  client?: { id: string; name: string; taxId: string };
}

/** Estado de la transmisión del e-CF a la DGII. */
export type EcfStatus = 'NOT_APPLICABLE' | 'STUBBED' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** Factura tal como la ve el cliente en su portal (`GET /portal/invoices`), con `overdue` derivado. */
export interface PortalInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  total: string;
  overdue: boolean;
}

/** Fila del listado global de facturas (`GET /ledger/invoices`). Incluye `overdue` derivado. */
export interface InvoiceListItem {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  paidAt: string | null;
  currency: string;
  total: string;
  amountPaid: string;
  overdue: boolean;
  ecfStatus?: EcfStatus;
  client: { id: string; name: string } | null;
  matter: { id: string; reference: string } | null;
}

// ── Provisión de fondos / retainer ───────────────────────────────────────────
export type ProvisionKind = 'ANTICIPO' | 'SUPLIDO' | 'GENERICO';
export type RetainerMovementType = 'DEPOSIT' | 'APPLICATION' | 'REFUND' | 'ADJUSTMENT';

/** Movimiento del saldo de provisión (importe con signo: DEPOSIT +, APPLICATION/REFUND −). */
export interface RetainerEntry {
  id: string;
  type: RetainerMovementType;
  kind: ProvisionKind | null;
  amount: string;
  invoiceId: string | null;
  note: string | null;
  createdAt: string;
}

/** Cuenta de provisión de un expediente (`GET /retainer/matter/:id`): saldo cacheado + movimientos. */
export interface RetainerAccount {
  matterId: string;
  currency: string | null;
  balance: string;
  entries: RetainerEntry[];
}

/** Saldo agregado de provisión de un cliente (`GET /retainer/client/:id`): Σ de sus expedientes. */
export interface ClientRetainer {
  clientId: string;
  currency: string | null;
  total: string;
  accounts: { matterId: string; currency: string; balance: string }[];
}

// ── Facturación programada (D-028, RP1-RP6) ──────────────────────────────────
export type BillingScheduleType = 'RECURRING' | 'INSTALLMENTS';
export type BillingFiscalMode = 'SERVICE_RENDERED' | 'ADVANCE';
export type BillingInterval = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type BillingScheduleStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type BillingInstallmentStatus = 'SCHEDULED' | 'EMITTED' | 'PAID' | 'SKIPPED' | 'FAILED';

/** Línea de la plantilla del plan (igual forma que la línea de factura). */
export interface BillingScheduleLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
}

/** Cuota/periodo del cuadro de un plan (`GET /billing/schedules/:id`). */
export interface BillingInstallment {
  id: string;
  sequence: number;
  dueDate: string;
  amount: string;
  status: BillingInstallmentStatus;
  invoiceId: string | null;
  paymentId: string | null;
}

/** Fila del listado de planes de un expediente (`GET /billing/schedules?matterId=`). */
export interface BillingScheduleListItem {
  id: string;
  type: BillingScheduleType;
  fiscalMode: BillingFiscalMode;
  status: BillingScheduleStatus;
  currency: string;
  intervalUnit: BillingInterval | null;
  intervalCount: number;
  occurrences: number | null;
  installmentCount: number | null;
  startDate: string;
  nextRunAt: string | null;
  installments: number;
  createdAt: string;
}

/** Un plan con su cuadro de cuotas completo (`GET /billing/schedules/:id`). */
export interface BillingSchedule {
  id: string;
  matterId: string;
  clientId: string;
  currency: string;
  type: BillingScheduleType;
  fiscalMode: BillingFiscalMode;
  status: BillingScheduleStatus;
  lines: BillingScheduleLine[];
  withholdingTaxCode: string | null;
  intervalUnit: BillingInterval | null;
  intervalCount: number;
  occurrences: number | null;
  installmentCount: number | null;
  startDate: string;
  nextRunAt: string | null;
  note: string | null;
  createdAt: string;
  installments: BillingInstallment[];
}

/** Cuerpo para crear un plan (`POST /billing/schedules`). */
export interface CreateBillingScheduleBody {
  matterId: string;
  type: BillingScheduleType;
  fiscalMode?: BillingFiscalMode;
  intervalUnit: BillingInterval;
  intervalCount?: number;
  occurrences?: number;
  installmentCount?: number;
  startDate: string;
  currency?: 'EUR' | 'USD' | 'DOP';
  withholdingTaxCode?: string;
  note?: string;
  lines: BillingScheduleLine[];
}

/** Resultado de emitir los periodos vencidos (`POST /billing/schedules/:id/run`). */
export interface BillingRunResult {
  scheduleId: string;
  emitted: { invoiceId: string; number: string; sequence: number }[];
  completed: boolean;
}

/** Resultado de cobrar una cuota de anticipo (`POST /billing/installments/:id/collect`). */
export interface BillingCollectResult {
  installmentId: string;
  invoiceId: string;
  number: string;
  total: string;
  balance: string;
  completed: boolean;
}

// ── Dunning (recordatorios de cobro) ─────────────────────────────────────────
export type DunningSeverity = 'REMINDER' | 'WARNING' | 'FINAL';
export type DunningReminderStatus = 'SCHEDULED' | 'SENT' | 'SKIPPED' | 'FAILED';
export type DunningChannel = 'IN_APP' | 'EMAIL' | 'SMS';

/** Recordatorio de cobro generado para una factura en una etapa del calendario de dunning. */
export interface DunningReminder {
  id: string;
  invoiceId: string;
  offsetDays: number;
  severity: DunningSeverity;
  channel: DunningChannel;
  status: DunningReminderStatus;
  scheduledFor: string;
  sentAt: string | null;
  createdAt: string;
}

/** Resumen de una corrida de "recordar ahora" (`POST /dunning/run`). */
export interface DunningRunSummary {
  evaluated: number;
  created: number;
  delivered: number;
  skipped: number;
  failed: number;
}

/** Totales fiscales neutrales (base/impuestos/retención/total) que devuelve el cálculo del provider. */
export interface InvoiceTotals {
  taxableBase: string;
  taxAmount: string;
  withholdingAmount: string;
  total: string;
}

/** Pre-cálculo fiscal en vivo (`POST /ledger/invoices/preview`): totales + formato de la jurisdicción. */
export interface InvoicePreview {
  jurisdiction: 'es' | 'do';
  format: 'VERIFACTU' | 'ECF';
  totals: InvoiceTotals;
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface Task {
  id: string;
  matterId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  deadlineType: string | null;
  isProcedural: boolean;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeadlineResult {
  dueDate: string;
  holidaysApplied?: string[];
}

export type DocumentReviewStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED';

export interface DocumentVersion {
  id: string;
  version: number;
  reviewStatus: DocumentReviewStatus;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** Letrado que subió la versión (de `GET /documents/by-matter/:id`). */
  uploadedBy?: { id: string; fullName: string };
}

export interface MatterDocument {
  id: string;
  name: string;
  /** Carpeta contenedora (sistema de ficheros). Null = raíz. */
  folderId: string | null;
  createdAt: string;
  versions: DocumentVersion[];
}

/** Tipo de contexto de una carpeta (alineado con el enum del backend). */
export type FolderKind = 'DOCUMENT' | 'TEMPLATE';

// ── Checklists de presentación ────────────────────────────────────────────────
export type ChecklistItemStatus = 'PENDING' | 'UPLOADED' | 'NA';
export type Jurisdiction = 'es' | 'do';

export interface PresentationRequirement {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  order: number;
}

export interface PresentationTaskTemplate {
  id: string;
  title: string;
  offsetDays: number;
  order: number;
}

export interface PresentationType {
  id: string;
  name: string;
  sector: string;
  jurisdiction: Jurisdiction | null;
  description: string | null;
  requirements: PresentationRequirement[];
  taskTemplates?: PresentationTaskTemplate[];
  _count?: { checklists: number };
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  requirementId: string | null;
  name: string;
  description: string | null;
  required: boolean;
  status: ChecklistItemStatus;
  documentId: string | null;
  order: number;
}

export interface MatterChecklist {
  id: string;
  matterId: string;
  presentationTypeId: string | null;
  title: string;
  createdAt: string;
  items: ChecklistItem[];
  progress: { total: number; done: number; percent: number };
}

/** Carpeta del sistema de ficheros (`GET /folders?kind=…`). Árbol vía `parentId`. */
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  kind: FolderKind;
  matterId: string | null;
}

// ── Firma electrónica (Signaturit, Fase 5) ────────────────────────────────────
export type SignatureStatus =
  | 'PENDING'
  | 'SIGNED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELED'
  | 'STUBBED';

export interface SignatureRequest {
  id: string;
  documentId: string;
  versionId: string;
  matterId: string;
  provider: string;
  externalId: string;
  status: SignatureStatus;
  signerName: string;
  signerEmail: string;
  signUrl: string | null;
  detail: string | null;
  requestedAt: string;
  completedAt: string | null;
  createdAt: string;
}

// ── Suscripción (SaaS de plataforma) ──────────────────────────────────────────
export type SubscriptionStatusValue = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED';

export type BillingCycle = 'MONTHLY' | 'ANNUAL' | 'BIENNIAL';
export type SubscriptionTierId = 'ESENCIAL' | 'PROFESIONAL' | 'AVANZADO';
export type PlanKey = SubscriptionTierId | 'FOUNDER';

/** Definición de un tier (precio lista €/plaza/mes). */
export interface PlanTierDef {
  id: SubscriptionTierId;
  monthlyEur: number;
  popular?: boolean;
}

/** Fila del catálogo resuelto (un plan en un ciclo y moneda). Fuente: backend (que lee del catálogo). */
export interface PlanPriceRow {
  plan: PlanKey;
  cycle: BillingCycle;
  currency: string;
  listMonthlyEur: number;
  perSeatPeriod: number;
  perSeatMonthly: number;
  savingsPct: number;
  stripeInterval: 'month' | 'year';
  stripeIntervalCount: number;
}

// ── IA ──────────────────────────────────────────────────────────────────────
export interface AiStatus {
  enabled: boolean;
  model: string | null;
  searchEnabled: boolean;
}

export interface AiCitation {
  sourceId: string;
  locator?: string;
}

export interface AiResponse {
  output: string;
  citations: AiCitation[];
  /** Confianza estimada [0,1]; baja + sin citas ⇒ revisar manualmente. */
  confidence: number;
  warnings: string[];
  model: string | null;
}

export interface AiEmailDraft extends AiResponse {
  subject: string;
  body: string;
}

/** Un turno de la conversación con el asistente agéntico (texto plano). */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Una herramienta ejecutada por el agente durante el turno (traza de transparencia). */
export interface AgentStep {
  tool: string;
  isError: boolean;
}

/** Una acción de escritura que el agente propone y que requiere confirmación del letrado (HITL). */
export interface PendingWrite {
  action: string;
  summary: string;
}

/** Respuesta del asistente agéntico (POST /ai/agent). */
export interface AgentResponse {
  output: string;
  steps: AgentStep[];
  model: string | null;
  stopReason: string;
  pendingWrites: PendingWrite[];
}

/** Resumen de una conversación guardada con Zora (historial del dock). */
export interface AiConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Conversación con Zora restaurada desde el servidor (con sus mensajes). `meta` lleva la UI rica. */
export interface AiConversationDetail {
  id: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string; meta: unknown }[];
}

export interface SemanticHit {
  kind: string;
  refId: string;
  refLabel: string;
  excerpt: string;
  score: number;
}

export interface SubscriptionInfo {
  status: SubscriptionStatusValue;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasAccess: boolean;
  seats: number;
  seatsUsed: number;
  seatCap: number;
  billingCycle: BillingCycle;
  /** Plan actual del despacho (tier o FOUNDER); informativo. */
  plan: PlanKey;
  isFounder: boolean;
  founderNumber: number | null;
  founderSlotsLeft: number;
  founderCap: number;
  founderMonthlyEur: number;
  founderCycles: BillingCycle[];
  /** Moneda de facturación del SaaS para este despacho (EUR/USD). */
  currency: string;
  /** Catálogo NUEVO de tiers (precio lista €/plaza/mes). */
  tiers: PlanTierDef[];
  /** Catálogo resuelto (filas tier×ciclo + fundador) en la moneda del despacho. */
  catalog: PlanPriceRow[];
}

/** Estado público del cupo de Fundador (para la landing). */
export interface FounderStatus {
  slotsLeft: number;
  cap: number;
}

/** Payload de inicio de pago: plazas, tier, ciclo y si solicita Plan Fundador. */
export interface CheckoutRequest {
  seats: number;
  tier: SubscriptionTierId;
  cycle: BillingCycle;
  founder: boolean;
}

/** Despacho visto por el super-admin de plataforma (consola). */
export interface PlatformTenant {
  id: string;
  name: string;
  jurisdiction: string;
  currency: string;
  status: SubscriptionStatusValue;
  seats: number;
  seatCap: number;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  seatsUsed: number;
  clients: number;
  matters: number;
  pricePerSeatEur: number;
  monthlyTotalEur: number;
}

// ── KYC / AML (Fase 4) ────────────────────────────────────────────────────────
export type KycStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type KycRisk = 'LOW' | 'MEDIUM' | 'HIGH';

/** Perfil KYC de un cliente (de `GET /kyc/:clientId`). */
export interface KycProfile {
  id: string;
  clientId: string;
  status: KycStatus;
  risk: KycRisk;
  isPep: boolean;
  identityVerified: boolean;
  sanctionsChecked: boolean;
  notes: string | null;
  reviewedAt: string | null;
}

/** Fila del panel AML (de `GET /kyc`). */
export interface KycOverviewRow {
  clientId: string;
  name: string;
  taxId: string;
  status: KycStatus;
  risk: KycRisk | null;
  isPep: boolean;
  reviewedAt: string | null;
}

/** Resumen del panel AML (de `GET /kyc/summary`). */
export interface KycSummary {
  total: number;
  byStatus: Record<KycStatus, number>;
  highRisk: number;
  pep: number;
}

// ── Informes (Fase 4) ─────────────────────────────────────────────────────────
export interface AgedReceivablesGroup {
  currency: string;
  totalOutstanding: number;
  buckets: { current: number; d1_30: number; d31_60: number; d60plus: number };
  items: {
    number: string;
    client: string;
    currency: string;
    dueDate: string | null;
    outstanding: number;
    daysOverdue: number;
  }[];
}

/** Cartera vencida agrupada por moneda (el despacho puede facturar en EUR/USD/DOP). */
export interface AgedReceivables {
  byCurrency: AgedReceivablesGroup[];
}

export interface TimeByLawyerRow {
  lawyerId: string;
  name: string;
  hours: number;
  amount: number;
  billedPct: number;
}

export interface ProfitabilityRow {
  matterId: string;
  reference: string;
  client: string;
  lawyer: string | null;
  hours: number;
  workValue: number;
  wip: number;
  cost: number;
  billed: number;
  collected: number;
  margin: number;
  realizationPct: number | null;
  marginPct: number | null;
}

export interface Profitability {
  currency: string;
  costRatesSet: boolean;
  entriesMissingCost: number;
  totals: {
    hours: number;
    workValue: number;
    wip: number;
    cost: number;
    billed: number;
    collected: number;
    margin: number;
    realizationPct: number | null;
    collectionPct: number | null;
    marginPct: number | null;
  };
  matters: ProfitabilityRow[];
  foreignInvoices: number;
}

/** Resumen fiscal para la gestoría (de `GET /reports/tax-summary`). */
export interface TaxSummaryClient {
  clientId: string;
  name: string;
  taxId: string | null;
  base: number;
  tax: number;
  withheld: number;
  total: number;
}
export interface TaxSummaryJurisdiction {
  jurisdiction: 'es' | 'do';
  currency: string;
  outputTax: { base: number; tax: number; invoices: number };
  withholding: { total: number };
  byClient: TaxSummaryClient[];
}
export interface TaxSummary {
  year: number;
  quarter: number | null;
  threshold347: number;
  jurisdictions: TaxSummaryJurisdiction[];
}

/** Evento de la línea de tiempo del expediente (de `GET /matters/:id/timeline`). */
export interface TimelineEvent {
  type: 'document' | 'task' | 'deadline' | 'ledger' | 'email' | 'message';
  at: string;
  title: string;
  subtitle: string | null;
}

/** Resultado de la búsqueda global (de `GET /search`). */
export interface GlobalSearch {
  clients: { id: string; name: string; taxId: string | null }[];
  matters: { id: string; reference: string; title: string }[];
  documents: { id: string; name: string; matterId: string; matterRef: string }[];
  invoices: { id: string; number: string; clientName: string }[];
}

/** Plantilla de documento del despacho (de `GET /templates`). `tokens` = marcadores del cuerpo. */
export interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  body: string;
  tokens?: string[];
  /** Carpeta contenedora (sistema de ficheros). Null = raíz. */
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Una revisión registrada sobre una versión (de `GET /documents/:id`). */
export interface DocumentReview {
  id: string;
  versionId: string;
  reviewerId: string;
  status: DocumentReviewStatus;
  comment: string | null;
  createdAt: string;
}

/** Versión enriquecida con sus revisiones (de `GET /documents/:id`). */
export interface DocumentVersionDetail extends DocumentVersion {
  documentId: string;
  uploadedById: string;
  reviews: DocumentReview[];
}

/** Documento con versiones y revisiones (de `GET /documents/:id`). */
export interface DocumentDetail {
  id: string;
  matterId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  versions: DocumentVersionDetail[];
}

// ── Tanda B: usuarios/licencia, ajustes, auditoría, aprobaciones ──────────────
export type StaffRole = 'FIRM_ADMIN' | 'LAWYER';

/** Un usuario del despacho (staff). De `GET /users`. */
export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: StaffRole;
  billRate: string | null;
  costRate: string | null;
  isSelf: boolean;
  createdAt: string;
}

/** Uso de plazas (asientos) por rol vs. la licencia del despacho. */
export interface SeatUsage {
  admins: { used: number; max: number };
  lawyers: { used: number; max: number };
}

/** Festivo local del despacho. */
export interface Holiday {
  date: string;
  name: string;
}

/** Ajustes del despacho (de `GET /settings`). */
export interface FirmSettings {
  tenant: {
    id: string;
    name: string;
    taxId: string | null;
    jurisdiction: 'es' | 'do';
    currency: string;
    locale: string;
    plan: string;
    maxAdmins: number;
    maxLawyers: number;
    invoiceSeries: string;
    deadlineEmailRemindersEnabled: boolean;
  };
  seats: SeatUsage;
  counts: { clients: number; matters: number };
  holidays: Holiday[];
  certificate: { name: string; uploadedAt: string | null } | null;
}

/** Resultado de la comprobación de conflictos (de `GET /clients/conflict-check`). */
export interface ConflictResult {
  query: string;
  /** El adversario YA es cliente del despacho (coincidencia por nombre). */
  matches: {
    id: string;
    name: string;
    taxId: string;
    taxIdKind: string | null;
    matters: { id: string; reference: string; title: string; status: MatterStatus }[];
  }[];
  /** Esta persona YA figura como parte contraria en otro expediente. */
  opposingMatters: {
    id: string;
    reference: string;
    title: string;
    status: MatterStatus;
    opposingParty: string | null;
    client: { name: string };
  }[];
}

/** Entrada del registro de auditoría (de `GET /audit`). */
export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
}

// ── Secretaría de sociedades ──────────────────────────────────────────────────

export interface CorporateMinute {
  id: string;
  kind: string;
  title: string;
  meetingDate: string;
  body: string;
}
export interface Shareholder {
  id: string;
  name: string;
  taxId: string | null;
  units: number;
}
export interface ShareTransfer {
  id: string;
  fromName: string | null;
  toName: string;
  units: number;
  date: string;
  note: string | null;
}
export interface RegistryObligation {
  id: string;
  title: string;
  dueDate: string;
  recurrence: string;
  status: string;
  filedAt: string | null;
  /** Registro/organismo ante el que se cumple la obligación. */
  registry: RegistryKind;
  /** Código de referencia/entrada del registro. */
  referenceCode: string | null;
}
export interface CompanySecretaryOverview {
  minutes: CorporateMinute[];
  shareholders: Shareholder[];
  transfers: ShareTransfer[];
  obligations: RegistryObligation[];
  totalUnits: number;
}

// ── Hoja de encargo ───────────────────────────────────────────────────────────

export interface EngagementLetter {
  id: string;
  matterId: string;
  scope: string;
  fees: string;
  terms: string;
  documentId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ── Data room (due diligence) ────────────────────────────────────────────────

export interface DataRoomSummary {
  id: string;
  name: string;
  status: string;
  watermark: boolean;
  createdAt: string;
  _count: { documents: number; grants: number; questions: number };
}
export interface DataRoomFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder?: number;
}
export interface DataRoomDoc {
  id: string;
  name: string;
  folderId: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
}
export interface DataRoomGrant {
  id: string;
  email: string;
  name: string | null;
  role: string;
  canDownload: boolean;
  folderIds: string[];
  /** Grupo de permisos del que hereda carpetas/descarga (null = permisos directos). */
  groupId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessAt: string | null;
  createdAt: string;
}
/** Grupo de permisos reutilizable de un data room (carpetas + descarga). */
export interface DataRoomGroup {
  id: string;
  name: string;
  folderIds: string[];
  canDownload: boolean;
}
export interface DataRoomDetail {
  id: string;
  matterId: string;
  name: string;
  watermark: boolean;
  status: string;
  folders: DataRoomFolderNode[];
  documents: DataRoomDoc[];
  grants: DataRoomGrant[];
  groups: DataRoomGroup[];
}
export interface DataRoomAccessEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetId: string | null;
  ip: string | null;
  createdAt: string;
}
export interface DataRoomQuestion {
  id: string;
  askedByEmail?: string;
  body: string;
  answer: string | null;
  status: string;
  documentId: string | null;
  folderId?: string | null;
  createdAt: string;
  answeredAt: string | null;
}
export interface CreateGrantResult {
  id: string;
  email: string;
  token: string;
}
/** Vista pública del data room para el externo (`GET /data-rooms/external/:token`). */
export interface ExternalDataRoom {
  name: string;
  viewer: { email: string; name: string | null };
  canDownload: boolean;
  watermark: boolean;
  folders: DataRoomFolderNode[];
  documents: DataRoomDoc[];
  rootFolderIds: string[];
}

// ── Redline: comparación de versiones de documento ───────────────────────────

export type RedlineSegmentType = 'equal' | 'insert' | 'delete';
export interface RedlineSegment {
  type: RedlineSegmentType;
  value: string;
}
/** Resultado de `GET /documents/:id/compare`. `extractable=false` si el formato no permite extraer texto. */
export interface CompareResult {
  baseVersion: number;
  againstVersion: number;
  extractable: boolean;
  segments: RedlineSegment[];
  added: number;
  removed: number;
}

// ── Cierre transaccional: checklist + binder ─────────────────────────────────

export type ClosingItemCategory =
  | 'CONDITION_PRECEDENT'
  | 'DELIVERABLE'
  | 'SIGNATURE_PAGE'
  | 'OTHER';
export type ClosingItemStatus = 'PENDING' | 'IN_PROGRESS' | 'WAIVED' | 'SATISFIED';
/** Fase de la operación a la que pertenece la partida del checklist. */
export type ClosingItemPhase = 'AT_SIGNING' | 'AT_CLOSING' | 'POST_CLOSING';

/** Plantilla integrada de checklist de cierre (`GET /closing/templates`). */
export interface ClosingTemplate {
  key: string;
  title: string;
  description: string;
  itemCount: number;
}

export interface ClosingChecklistItem {
  id: string;
  category: ClosingItemCategory;
  title: string;
  detail: string | null;
  status: ClosingItemStatus;
  responsibleParty: string | null;
  assigneeId: string | null;
  documentId: string | null;
  dueDate: string | null;
  sortOrder: number;
  /** Fase de la operación (firma / cierre / post-cierre). */
  phase: ClosingItemPhase;
  /** La partida está en depósito (escrow) pendiente de liberación. */
  inEscrow: boolean;
  /** Fecha de liberación del depósito, si ya se liberó. */
  releasedAt: string | null;
}

/** Fases de gating del cierre (condiciones a la firma / al cierre). */
export type GatingPhase = 'AT_SIGNING' | 'AT_CLOSING';

/** Readiness de una fase: estado de las condiciones previas (CPs) que la gatean. */
export interface PhaseReadiness {
  phase: GatingPhase;
  total: number;
  satisfied: number;
  waived: number;
  pending: number;
  pendingTitles: string[];
  pct: number;
  ready: boolean;
}

/** Readiness de gating por fase (`readiness` en el detalle del checklist y `…/readiness` por expediente). */
export interface ChecklistReadiness {
  byPhase: PhaseReadiness[];
}

/** Checklist con sus partidas (`GET /closing/:id`). */
export interface ClosingChecklistDetail {
  id: string;
  matterId: string;
  title: string;
  closingDate: string | null;
  signingDate: string | null;
  longstopDate: string | null;
  items: ClosingChecklistItem[];
  /** Readiness de gating (CPs por fase) computada server-side (T-2). */
  readiness: ChecklistReadiness;
}

/** Resumen de un checklist en la lista de un expediente (`GET /closing/by-matter/:matterId`). */
export interface ClosingChecklistSummary {
  id: string;
  title: string;
  closingDate: string | null;
  signingDate: string | null;
  longstopDate: string | null;
  createdAt: string;
  total: number;
  satisfied: number;
}

// ── Operación (deal cockpit): partes, hitos, disclosures, presentaciones ──────

/** Registro/organismo (compartido por presentaciones registrales y obligaciones de secretaría). */
export type RegistryKind =
  | 'REGISTRO_MERCANTIL'
  | 'REGISTRO_PROPIEDAD'
  | 'INDICE_UNICO_NOTARIAL'
  | 'NOTARIA'
  | 'REGISTRO_TITULOS_RD'
  | 'CAMARA_COMERCIO_RD'
  | 'OTHER';

export type DealPartySide = 'BUYER' | 'SELLER' | 'COMPANY' | 'LENDER' | 'BORROWER' | 'OTHER';
export type DealPartyRole =
  | 'PRINCIPAL'
  | 'LEGAL_COUNSEL'
  | 'FINANCIAL_ADVISOR'
  | 'NOTARY'
  | 'OTHER';

export interface DealParty {
  id: string;
  side: DealPartySide;
  role: DealPartyRole;
  name: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  isDistribution: boolean;
  notes: string | null;
  sortOrder: number;
}

export type DealMilestoneKind =
  | 'SIGNING'
  | 'CLOSING'
  | 'LONGSTOP'
  | 'CONDITIONS_DEADLINE'
  | 'FUNDS_FLOW'
  | 'FILING'
  | 'CUSTOM';
export type DealMilestoneStatus = 'PENDING' | 'DONE' | 'MISSED';

export interface DealMilestone {
  id: string;
  kind: DealMilestoneKind;
  title: string;
  targetDate: string;
  status: DealMilestoneStatus;
  completedAt: string | null;
  notes: string | null;
  sortOrder: number;
}

export type DisclosureScheduleStatus = 'DRAFT' | 'AGREED';

export interface DisclosureSchedule {
  id: string;
  number: string;
  repWarranty: string | null;
  title: string;
  body: string | null;
  documentId: string | null;
  status: DisclosureScheduleStatus;
  sortOrder: number;
}

export type RegistryFilingStatus = 'PENDING' | 'SUBMITTED' | 'REGISTERED' | 'REJECTED';

export interface RegistryFiling {
  id: string;
  registry: RegistryKind;
  title: string;
  referenceCode: string | null;
  status: RegistryFilingStatus;
  submittedAt: string | null;
  registeredAt: string | null;
  documentId: string | null;
  notes: string | null;
  sortOrder: number;
}

/** Vista completa de la operación (`GET /deal/:matterId`; cada mutación devuelve este objeto). */
export interface DealOverview {
  parties: DealParty[];
  milestones: DealMilestone[];
  disclosureSchedules: DisclosureSchedule[];
  registryFilings: RegistryFiling[];
}

// ── Funds flow / escrow (closing statement) ───────────────────────────────────

export type FundsFlowKind = 'PAYMENT' | 'ESCROW_DEPOSIT' | 'ESCROW_RELEASE' | 'FEE' | 'ADJUSTMENT';
export type FundsFlowStatus = 'PLANNED' | 'SETTLED';
export type EscrowStatus = 'HELD' | 'PARTIALLY_RELEASED' | 'RELEASED';

export interface DealFundsFlowLine {
  id: string;
  kind: FundsFlowKind;
  payerPartyId: string | null;
  payeePartyId: string | null;
  /** Importe como string decimal (p. ej. "1000000.00"). */
  amount: string;
  currency: string;
  account: string | null;
  condition: string | null;
  status: FundsFlowStatus;
  settledAt: string | null;
  sortOrder: number;
}

export interface EscrowRelease {
  id: string;
  amount: string;
  releasedAt: string;
  reason: string | null;
}

export interface EscrowHolding {
  id: string;
  label: string;
  amount: string;
  currency: string;
  agent: string | null;
  depositedAt: string | null;
  releaseTrigger: string | null;
  status: EscrowStatus;
  notes: string | null;
  sortOrder: number;
  releases: EscrowRelease[];
  /** Liberado y remanente, calculados en el servidor (strings decimales). */
  released: string;
  remaining: string;
}

export interface CurrencyReconciliation {
  currency: string;
  totalPaid: number;
  totalReceived: number;
  imbalance: number;
  balanced: boolean;
}

export interface PartyBalance {
  partyId: string;
  currency: string;
  paid: number;
  received: number;
  net: number;
}

export interface FundsFlowReconciliation {
  byCurrency: CurrencyReconciliation[];
  byParty: PartyBalance[];
  balanced: boolean;
}

/** Vista del funds-flow + escrow (`GET /deal/:matterId/funds-flow`; cada mutación devuelve este objeto). */
export interface FundsFlowOverview {
  lines: DealFundsFlowLine[];
  escrowHoldings: EscrowHolding[];
  reconciliation: FundsFlowReconciliation;
}

/** Coste propuesto pendiente de aprobación (de `GET /ledger/approvals`). */
export interface CostApproval {
  id: string;
  matter: { id: string; reference: string; title: string };
  description: string;
  amount: string;
  currency: string;
  note: string | null;
  proposedBy: string;
  createdAt: string;
}
