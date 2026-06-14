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
