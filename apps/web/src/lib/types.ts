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
}

/** `GET /matters/:id` incluye un extracto del cliente. */
export interface MatterDetail extends Matter {
  client: { id: string; name: string; taxId: string };
}

export interface Client {
  id: string;
  name: string;
  taxId: string;
  taxIdKind: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
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

export interface LedgerEntry {
  id: string;
  matterId: string;
  type: LedgerEntryType;
  description: string;
  amount: string;
  currency: string;
  invoiceId: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface MatterLedger {
  matterId: string;
  currency: string;
  balance: string;
  entries: LedgerEntry[];
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'SENT' | 'PAID' | 'CANCELLED';

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
  currency: string;
  taxableBase: string;
  taxAmount: string;
  withholdingAmount: string;
  total: string;
  complianceFormat: 'VERIFACTU' | 'ECF' | null;
  complianceRecord: Record<string, unknown> | null;
  recordHash: string | null;
  previousRecordHash: string | null;
  lines: InvoiceLine[];
  client?: { id: string; name: string; taxId: string };
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
}

export interface MatterDocument {
  id: string;
  name: string;
  createdAt: string;
  versions: DocumentVersion[];
}
