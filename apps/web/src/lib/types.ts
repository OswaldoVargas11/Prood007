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
  /** Incluidos en `GET /matters` (lista): cliente y letrado responsable. */
  client?: { id: string; name: string };
  lawyer?: { id: string; fullName: string } | null;
}

/** `GET /matters/:id` incluye un extracto del cliente y el letrado responsable. */
export interface MatterDetail extends Matter {
  client: { id: string; name: string; taxId: string };
}

/** Letrado asignable a un expediente (`GET /matters/assignees`, solo admin). */
export interface Assignee {
  id: string;
  fullName: string;
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

export interface DashboardSummary {
  currency: string;
  kpis: {
    activeMatters: number;
    totalMatters: number;
    totalClients: number;
    openTasks: number;
    upcomingDeadlines: number;
    urgentDeadlines: number;
    pendingReviews: number;
    billableThisMonth: string;
    outstanding: string;
  };
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

export interface Message {
  id: string;
  matterId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string };
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
}

export interface MatterLedger {
  matterId: string;
  currency: string;
  balance: string;
  entries: LedgerEntry[];
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
  lines: InvoiceLine[];
  client?: { id: string; name: string; taxId: string };
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
  client: { id: string; name: string } | null;
  matter: { id: string; reference: string } | null;
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
  createdAt: string;
  versions: DocumentVersion[];
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
  };
  seats: SeatUsage;
  counts: { clients: number; matters: number };
  holidays: Holiday[];
  certificate: { name: string; uploadedAt: string | null } | null;
}

/** Resultado de la comprobación de conflictos (de `GET /clients/conflict-check`). */
export interface ConflictResult {
  query: string;
  matches: {
    id: string;
    name: string;
    taxId: string;
    taxIdKind: string | null;
    matters: { id: string; reference: string; title: string; status: MatterStatus }[];
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
