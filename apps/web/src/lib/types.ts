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
