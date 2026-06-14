'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  AuditEntry,
  Client,
  CostApproval,
  DashboardSummary,
  DeadlineResult,
  DocumentDetail,
  DocumentReviewStatus,
  FirmSettings,
  Invoice,
  LedgerEntryType,
  Matter,
  MatterDetail,
  MatterDocument,
  MatterLedger,
  MatterStatus,
  Message,
  Notification,
  Paginated,
  SeatUsage,
  StaffRole,
  StaffUser,
  Task,
  TaskStatus,
} from './types';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
    staleTime: 15_000,
  });
}

/** Conteo barato para KPIs (pide 1 elemento y usa `total`). */
export function useResourceCount(resource: 'clients' | 'matters') {
  return useQuery({
    queryKey: [resource, 'count'],
    queryFn: () => api.get<Paginated<unknown>>(`/${resource}?page=1&pageSize=1`),
  });
}

export function useMatters(
  params: { page?: number; pageSize?: number; status?: MatterStatus; clientId?: string } = {},
) {
  const { page = 1, pageSize = 20, status, clientId } = params;
  return useQuery({
    queryKey: ['matters', { page, pageSize, status: status ?? null, clientId: clientId ?? null }],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) qs.set('status', status);
      if (clientId) qs.set('clientId', clientId);
      return api.get<Paginated<Matter>>(`/matters?${qs.toString()}`);
    },
  });
}

export function useClients(params: { page?: number; pageSize?: number } = {}) {
  const { page = 1, pageSize = 50 } = params;
  return useQuery({
    queryKey: ['clients', { page, pageSize }],
    queryFn: () => api.get<Paginated<Client>>(`/clients?page=${page}&pageSize=${pageSize}`),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<Client>(`/clients/${id}`),
    enabled: Boolean(id),
  });
}

export function useMatter(id: string) {
  return useQuery({
    queryKey: ['matter', id],
    queryFn: () => api.get<MatterDetail>(`/matters/${id}`),
    enabled: Boolean(id),
  });
}

export function useChangeMatterStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: MatterStatus) =>
      api.patch<MatterDetail>(`/matters/${id}/status`, { status }),
    onSuccess: (data) => {
      qc.setQueryData(['matter', id], data);
      void qc.invalidateQueries({ queryKey: ['matters'] });
    },
  });
}

// ── Documentos (F2) ──────────────────────────────────────────────────────────
export function useMatterDocuments(matterId: string) {
  return useQuery({
    queryKey: ['documents', matterId],
    queryFn: () => api.get<MatterDocument[]>(`/documents/by-matter/${matterId}`),
    enabled: Boolean(matterId),
  });
}

/** Documento con versiones + revisiones (para la vista de comparación/revisión, A.4). */
export function useDocument(id: string) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
    enabled: Boolean(id),
  });
}

export function useUploadDocument(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name?: string }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('matterId', matterId);
      if (name) form.append('name', name);
      return api.upload<MatterDocument>('/documents', form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', matterId] }),
  });
}

export function useAddDocumentVersion(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, file }: { documentId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload(`/documents/${documentId}/versions`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', matterId] }),
  });
}

export function useReviewVersion(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      status,
      comment,
    }: {
      versionId: string;
      status: DocumentReviewStatus;
      comment?: string;
    }) => api.post(`/documents/versions/${versionId}/review`, { status, comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', matterId] }),
  });
}

// ── Tareas y plazos (F3) ─────────────────────────────────────────────────────
export function useTasks(filters: { matterId?: string; status?: TaskStatus } = {}) {
  return useQuery({
    queryKey: ['tasks', { matterId: filters.matterId ?? null, status: filters.status ?? null }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filters.matterId) qs.set('matterId', filters.matterId);
      if (filters.status) qs.set('status', filters.status);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<Task[]>(`/tasks${suffix}`);
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      dueDate?: string;
      matterId?: string;
      assigneeId?: string;
    }) => api.post<Task>('/tasks', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useCreateTaskFromDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      deadlineType: string;
      startDate: string;
      days: number;
      title?: string;
      matterId?: string;
    }) => api.post<{ task: Task; deadline: DeadlineResult }>('/tasks/from-deadline', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: TaskStatus; title?: string }) =>
      api.patch<Task>(`/tasks/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// ── Ledger + Facturación (F4) ────────────────────────────────────────────────
export function useMatterLedger(matterId: string) {
  return useQuery({
    queryKey: ['ledger', matterId],
    queryFn: () => api.get<MatterLedger>(`/ledger/matter/${matterId}`),
    enabled: Boolean(matterId),
  });
}

function invalidateMatterBilling(qc: ReturnType<typeof useQueryClient>, matterId: string) {
  void qc.invalidateQueries({ queryKey: ['ledger', matterId] });
}

export function useAddLedgerEntry(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: LedgerEntryType; amount: string; description: string }) =>
      api.post('/ledger/entries', { ...body, matterId }),
    onSuccess: () => invalidateMatterBilling(qc, matterId),
  });
}

export function useAddTimeEntry(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      description: string;
      minutes: number;
      hourlyRate: string;
      workedAt: string;
    }) => api.post('/ledger/time', { ...body, matterId }),
    onSuccess: () => invalidateMatterBilling(qc, matterId),
  });
}

export interface InvoiceLineInput {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
}

export function useCreateInvoice(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      lines: InvoiceLineInput[];
      withholdingTaxCode?: string;
      issueDate?: string;
    }) => api.post<{ invoice: Invoice }>('/ledger/invoices', { ...body, matterId }),
    onSuccess: () => invalidateMatterBilling(qc, matterId),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Invoice>(`/ledger/invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function usePayInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Invoice>(`/ledger/invoices/${id}/pay`),
    onSuccess: (data) => {
      qc.setQueryData(['invoice', id], data);
      void qc.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
}

// ── Chat por expediente (F5) ─────────────────────────────────────────────────
export function useMessages(matterId: string) {
  return useQuery({
    queryKey: ['messages', matterId],
    queryFn: () => api.get<Message[]>(`/matters/${matterId}/messages`),
    enabled: Boolean(matterId),
  });
}

export function useSendMessage(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<Message>(`/matters/${matterId}/messages`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', matterId] }),
  });
}

// ── Notificaciones (F5) ──────────────────────────────────────────────────────
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/**
 * Marca todas las notificaciones recibidas como leídas. El backend solo expone marcar una a una
 * (`PATCH /notifications/:id/read`), así que lo hacemos en paralelo cliente-side (Tanda A, sin tocar
 * el backend). Idempotente: el endpoint solo afecta a las no leídas.
 */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api.patch(`/notifications/${id}/read`))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ── Portal del cliente (F6, solo lectura) ────────────────────────────────────
export function usePortalMatters() {
  return useQuery({
    queryKey: ['portal', 'matters'],
    queryFn: () => api.get<Matter[]>('/portal/matters'),
  });
}
export function usePortalMatter(id: string) {
  return useQuery({
    queryKey: ['portal', 'matter', id],
    queryFn: () => api.get<Matter>(`/portal/matters/${id}`),
    enabled: Boolean(id),
  });
}
export function usePortalDocuments(id: string) {
  return useQuery({
    queryKey: ['portal', 'documents', id],
    queryFn: () => api.get<MatterDocument[]>(`/portal/matters/${id}/documents`),
    enabled: Boolean(id),
  });
}
export function usePortalLedger(id: string) {
  return useQuery({
    queryKey: ['portal', 'ledger', id],
    queryFn: () => api.get<MatterLedger>(`/portal/matters/${id}/ledger`),
    enabled: Boolean(id),
  });
}
export function usePortalTasks(id: string) {
  return useQuery({
    queryKey: ['portal', 'tasks', id],
    queryFn: () => api.get<Task[]>(`/portal/matters/${id}/tasks`),
    enabled: Boolean(id),
  });
}
export function usePortalInvoices() {
  return useQuery({
    queryKey: ['portal', 'invoices'],
    queryFn: () => api.get<Invoice[]>('/portal/invoices'),
  });
}

// ── Alta de cliente / expediente / acceso al portal (Tanda B) ─────────────────
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      taxId: string;
      email?: string;
      phone?: string;
      address?: string;
    }) => api.post<Client>('/clients', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useCreateMatter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; type: string; clientId: string; lawyerId?: string }) =>
      api.post<Matter>('/matters', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['matters'] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useCreatePortalUser(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; fullName: string; password: string }) =>
      api.post<{ userId: string; email: string }>(`/clients/${clientId}/portal-user`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', clientId] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

// ── Usuarios del despacho + licencia (Tanda B, solo admin) ────────────────────
export function useStaff() {
  return useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffUser[]>('/users') });
}

export function useSeats() {
  return useQuery({ queryKey: ['seats'], queryFn: () => api.get<SeatUsage>('/users/seats') });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; fullName: string; password: string; role: StaffRole }) =>
      api.post<StaffUser>('/users', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['seats'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; isActive?: boolean; role?: StaffRole }) =>
      api.patch(`/users/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['seats'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

// ── Ajustes del despacho (Tanda B, solo admin) ────────────────────────────────
export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<FirmSettings>('/settings') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; taxId?: string; locale?: string }) =>
      api.patch<FirmSettings>('/settings', body),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  });
}

// ── Auditoría (Tanda B, solo admin) ───────────────────────────────────────────
export function useAuditLog(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['audit', { page, pageSize }],
    queryFn: () => api.get<Paginated<AuditEntry>>(`/audit?page=${page}&pageSize=${pageSize}`),
  });
}

// ── Aprobación de costes (Tanda B) ────────────────────────────────────────────
export function useApprovals() {
  return useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get<CostApproval[]>('/ledger/approvals'),
  });
}

export function useProposeCost(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { description: string; amount: string; note?: string }) =>
      api.post('/ledger/costs/propose', { ...body, matterId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ledger', matterId] });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useResolveCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: 'approve' | 'reject';
      note?: string;
    }) => api.post(`/ledger/approvals/${id}/${action}`, { note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
}

/** Descarga una versión y dispara la descarga en el navegador. */
export async function downloadVersion(versionId: string, filename: string): Promise<void> {
  const blob = await api.download(`/documents/versions/${versionId}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
