'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getAccessToken, setAccessToken } from './api';
import { toastMsg } from './toasts';
import type {
  AnonymizeResult,
  Assignee,
  AuditEntry,
  BillingCollectResult,
  BillingRunResult,
  BillingSchedule,
  BillingScheduleListItem,
  Client,
  ClientsPage,
  ConflictResult,
  ClientRetainer,
  CostApproval,
  CreateBillingScheduleBody,
  DashboardSummary,
  DeadlineResult,
  DunningReminder,
  DunningRunSummary,
  AgedReceivables,
  DocumentDetail,
  DocumentTemplate,
  KycOverviewRow,
  KycProfile,
  KycSummary,
  TimeByLawyerRow,
  DocumentReviewStatus,
  FirmSettings,
  ImportPreview,
  ImportResult,
  Invoice,
  InvoiceListItem,
  InvoicePreview,
  InvoiceStatus,
  Lead,
  LeadStatus,
  LedgerEntryType,
  Matter,
  MatterDetail,
  MatterDocument,
  MatterEmail,
  MatterLedger,
  MatterStatus,
  Message,
  Notification,
  CheckoutRequest,
  Paginated,
  PaymentConfig,
  SignatureRequest,
  SubscriptionInfo,
  PortalInvoice,
  Profitability,
  TaxSummary,
  GlobalSearch,
  TimelineEvent,
  ProvisionKind,
  RecentEmail,
  RetainerAccount,
  StripeConnectStatus,
  SeatUsage,
  StaffRole,
  StaffUser,
  Task,
  TaskStatus,
  TimeSummary,
  AiStatus,
  AiResponse,
  AiEmailDraft,
  SemanticHit,
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
    queryFn: () => api.get<ClientsPage>(`/clients?page=${page}&pageSize=${pageSize}`),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<Client>(`/clients/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * RGPD/Ley 172-13 — anonimización del titular (solo FIRM_ADMIN en el backend). Sobrescribe la PII
 * del registro maestro y corta el portal; el expediente y las facturas se PRESERVAN. Irreversible.
 */
export function useAnonymizeClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AnonymizeResult>(`/clients/${id}/anonymize`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', id] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
    meta: { successToast: toastMsg.clientAnonymized },
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

/** Línea de tiempo unificada del expediente (documentos, tareas, ledger, correos, chat). */
export function useMatterTimeline(id: string) {
  return useQuery({
    queryKey: ['matter-timeline', id],
    queryFn: () => api.get<{ events: TimelineEvent[] }>(`/matters/${id}/timeline`),
    enabled: Boolean(id),
  });
}

/** Letrados asignables (solo admin). Se habilita con `enabled` para no llamarlo con rol LAWYER. */
export function useAssignees(enabled = true) {
  return useQuery({
    queryKey: ['matter-assignees'],
    queryFn: () => api.get<Assignee[]>('/matters/assignees'),
    enabled,
    staleTime: 60_000,
  });
}

/** Asigna o desasigna (`null`) el letrado responsable. Solo admin. */
export function useAssignMatterLawyer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lawyerId: string | null) =>
      api.patch<MatterDetail>(`/matters/${id}/lawyer`, { lawyerId }),
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

// ── Importar documentos desde la nube (Google Drive / OneDrive / SharePoint) ──

export type GoogleDriveConfig = {
  configured: boolean;
  connected: boolean;
  clientId: string | null;
  apiKey: string | null;
  appId: string | null;
  scope: string;
};
export type MicrosoftFilesStatus = { configured: boolean; connected: boolean };
export type CloudEntry = {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  driveId: string | null;
};
export type SharePointSite = {
  id: string;
  name: string;
  webUrl: string;
  driveId: string | null;
};

/** Referencia al fichero elegido en la nube + proveedor (lo que espera POST /documents/import/cloud). */
export type CloudImportInput = {
  provider: 'google' | 'microsoft';
  fileId?: string;
  driveId?: string;
  itemId?: string;
  name?: string;
};

export function useGoogleDriveConfig() {
  return useQuery({
    queryKey: ['google-drive-config'],
    queryFn: () => api.get<GoogleDriveConfig>('/integrations/google/drive/config'),
  });
}

export function useMicrosoftFilesStatus() {
  return useQuery({
    queryKey: ['microsoft-files-status'],
    queryFn: () => api.get<MicrosoftFilesStatus>('/integrations/microsoft/files/status'),
  });
}

/** Lista una carpeta de OneDrive (sin driveId = raíz) o de una unidad de SharePoint. */
export function useMicrosoftFiles(
  loc: { driveId?: string; itemId?: string } | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['microsoft-files', loc?.driveId ?? null, loc?.itemId ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (loc?.driveId) params.set('driveId', loc.driveId);
      if (loc?.itemId) params.set('itemId', loc.itemId);
      const qs = params.toString();
      return api.get<CloudEntry[]>(`/integrations/microsoft/files${qs ? `?${qs}` : ''}`);
    },
    enabled,
  });
}

export function useSharePointSites(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['sharepoint-sites', query],
    queryFn: () =>
      api.get<SharePointSite[]>(`/integrations/microsoft/sites?q=${encodeURIComponent(query)}`),
    enabled,
  });
}

export function useImportCloudDocument(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloudImportInput) =>
      api.post<MatterDocument>('/documents/import/cloud', { matterId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', matterId] }),
  });
}

// ── Firma electrónica (Signaturit, Fase 5) ────────────────────────────────────

export function useDocumentSignatures(documentId: string | null) {
  return useQuery({
    queryKey: ['signatures', 'document', documentId],
    queryFn: () => api.get<SignatureRequest[]>(`/signatures/by-document/${documentId}`),
    enabled: !!documentId,
  });
}

export function useRequestSignature(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { versionId: string; signerName: string; signerEmail: string }) =>
      api.post<SignatureRequest>('/signatures', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['signatures', 'document', documentId] }),
  });
}

export function useCancelSignature(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<SignatureRequest>(`/signatures/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['signatures', 'document', documentId] }),
  });
}

// ── KYC / AML (Fase 4) ────────────────────────────────────────────────────────
export function useKycOverview() {
  return useQuery({ queryKey: ['kyc'], queryFn: () => api.get<KycOverviewRow[]>('/kyc') });
}

export function useKycSummary() {
  return useQuery({
    queryKey: ['kyc', 'summary'],
    queryFn: () => api.get<KycSummary>('/kyc/summary'),
  });
}

export function useClientKyc(clientId: string) {
  return useQuery({
    queryKey: ['kyc', clientId],
    queryFn: () => api.get<KycProfile | null>(`/kyc/${clientId}`),
    enabled: Boolean(clientId),
  });
}

export function useUpsertKyc(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<KycProfile, 'id' | 'clientId' | 'reviewedAt'>>) =>
      api.put<KycProfile>(`/kyc/${clientId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kyc'] });
    },
  });
}

// ── Informes (Fase 4) ─────────────────────────────────────────────────────────
export function useAgedReceivables() {
  return useQuery({
    queryKey: ['reports', 'aged-receivables'],
    queryFn: () => api.get<AgedReceivables>('/reports/aged-receivables'),
  });
}

export function useTimeByLawyer() {
  return useQuery({
    queryKey: ['reports', 'time-by-lawyer'],
    queryFn: () => api.get<TimeByLawyerRow[]>('/reports/time-by-lawyer'),
  });
}

export function useProfitability() {
  return useQuery({
    queryKey: ['reports', 'profitability'],
    queryFn: () => api.get<Profitability>('/reports/profitability'),
  });
}

/** Resumen fiscal para la gestoría: año + trimestre (0 = año completo). */
export function useTaxSummary(year: number, quarter: number) {
  return useQuery({
    queryKey: ['reports', 'tax-summary', year, quarter],
    queryFn: () => api.get<TaxSummary>(`/reports/tax-summary?year=${year}&quarter=${quarter}`),
  });
}

/** Búsqueda global del despacho (clientes/expedientes/documentos/facturas). */
export function useGlobalSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<GlobalSearch>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
}

/** Reenvía el correo de verificación al usuario autenticado pero sin confirmar. */
export function useResendVerification() {
  return useMutation({ mutationFn: () => api.post('/auth/resend-verification') });
}

/** Proveedores de login social habilitados en el servidor (Google/Microsoft). */
export function useSocialProviders() {
  return useQuery({
    queryKey: ['social-providers'],
    queryFn: () => api.get<{ google: boolean; microsoft: boolean }>('/auth/social/providers'),
    staleTime: Infinity,
  });
}

// ── MFA / 2FA ─────────────────────────────────────────────────────────────────
export function useMfaStatus() {
  return useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => api.get<{ enabled: boolean }>('/auth/mfa/status'),
  });
}
export function useMfaSetup() {
  return useMutation({
    mutationFn: () =>
      api.post<{ secret: string; otpauthUri: string; qrDataUrl: string }>('/auth/mfa/setup'),
  });
}
export function useMfaEnable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<{ backupCodes: string[] }>('/auth/mfa/enable', { code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mfa-status'] }),
  });
}
export function useMfaDisable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post('/auth/mfa/disable', { code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mfa-status'] }),
  });
}

// ── Preferencias de notificación del propio usuario (self-service) ─────────────
type NotificationPrefs = { deadlineEmailRemindersEnabled: boolean };
export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.get<NotificationPrefs>('/notifications/preferences'),
  });
}
export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationPrefs) =>
      api.patch<NotificationPrefs>('/notifications/preferences', body),
    onSuccess: (data) => qc.setQueryData(['notification-preferences'], data),
    meta: { successToast: toastMsg.settingsSaved },
  });
}

// ── Plantillas de documento (Fase 3) ─────────────────────────────────────────
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<DocumentTemplate[]>('/templates'),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; body: string }) =>
      api.post<DocumentTemplate>('/templates', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
    meta: { successToast: toastMsg.templateCreated },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      body?: string;
    }) => api.patch<DocumentTemplate>(`/templates/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
    meta: { successToast: toastMsg.templateDeleted },
  });
}

/** Genera un documento en un expediente a partir de una plantilla (refresca los documentos). */
export function useGenerateFromTemplate(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { templateId: string; name?: string }) =>
      api.post<MatterDocument>('/documents/from-template', { ...body, matterId }),
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
    meta: { successToast: toastMsg.taskCreated },
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
      notificationRef?: string;
    }) => api.post<{ task: Task; deadline: DeadlineResult }>('/tasks/from-deadline', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

/** Preview del plazo (LexNET-lite): calcula la fecha límite en vivo, sin crear la tarea. */
export function useDeadlinePreview(
  input: { deadlineType: string; startDate: string; days: number } | null,
) {
  return useQuery({
    queryKey: ['deadline-preview', input],
    queryFn: () => api.post<DeadlineResult>('/tasks/deadline-preview', input!),
    enabled: Boolean(input && input.startDate && input.days > 0 && input.deadlineType),
    staleTime: 60_000,
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
    meta: { successToast: toastMsg.taskDeleted },
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
      hourlyRate?: string;
      workedAt: string;
    }) => api.post('/ledger/time', { ...body, matterId }),
    onSuccess: () => {
      invalidateMatterBilling(qc, matterId);
      void qc.invalidateQueries({ queryKey: ['time'] });
    },
  });
}

/** Listado de fichas de tiempo (`GET /ledger/time`): repaso del día / tiempo sin facturar. */
export function useTimeEntries(filter?: {
  mine?: boolean;
  unbilled?: boolean;
  date?: string;
  matterId?: string;
}) {
  const params = new URLSearchParams();
  if (filter?.mine) params.set('mine', 'true');
  if (filter?.unbilled) params.set('unbilled', 'true');
  if (filter?.date) params.set('date', filter.date);
  if (filter?.matterId) params.set('matterId', filter.matterId);
  const qs = params.toString();
  return useQuery({
    queryKey: ['time', filter ?? {}],
    queryFn: () => api.get<TimeSummary>(`/ledger/time${qs ? `?${qs}` : ''}`),
  });
}

/** Registro de tiempo global (sin atarse a un expediente fijo): el `matterId` va en el cuerpo. */
export function useLogTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      matterId: string;
      description: string;
      minutes: number;
      hourlyRate?: string;
      workedAt: string;
    }) => api.post('/ledger/time', body),
    onSuccess: (_data, vars) => {
      invalidateMatterBilling(qc, vars.matterId);
      void qc.invalidateQueries({ queryKey: ['time'] });
    },
    meta: { successToast: toastMsg.timeLogged },
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
      currency?: 'EUR' | 'USD' | 'DOP';
      invoiceFormat?: 'es' | 'do';
    }) => api.post<{ invoice: Invoice }>('/ledger/invoices', { ...body, matterId }),
    onSuccess: () => invalidateMatterBilling(qc, matterId),
    meta: { successToast: toastMsg.invoiceCreated },
  });
}

/** Línea mínima para el pre-cálculo fiscal (la descripción no interviene en la matemática). */
export interface PreviewLineInput {
  quantity: string;
  unitPrice: string;
  taxCode: string;
}

/**
 * Pre-cálculo fiscal en vivo (read-only). Reutiliza la matemática fiscal real del backend: nunca se
 * calculan impuestos en el cliente. Se habilita con `enabled` (líneas válidas) y conserva el último
 * resultado mientras recalcula para que el preview no parpadee al teclear.
 */
export function useInvoicePreview(
  lines: PreviewLineInput[],
  withholdingTaxCode: string | undefined,
  enabled: boolean,
  invoiceFormat?: 'es' | 'do',
) {
  return useQuery({
    queryKey: ['invoice-preview', lines, withholdingTaxCode ?? null, invoiceFormat ?? null],
    queryFn: () =>
      api.post<InvoicePreview>('/ledger/invoices/preview', {
        lines,
        withholdingTaxCode,
        invoiceFormat,
      }),
    enabled,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
    retry: false,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Invoice>(`/ledger/invoices/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Listado global de facturas del despacho (`GET /ledger/invoices`). Filtros opcionales por estado
 * persistido y por vencimiento derivado (`overdue`). Reemplaza la reconstrucción cliente-side desde
 * los apuntes INVOICE del ledger.
 */
export function useInvoices(filter?: { status?: InvoiceStatus; overdue?: boolean }) {
  const params = new URLSearchParams();
  if (filter?.status) params.set('status', filter.status);
  if (filter?.overdue) params.set('overdue', 'true');
  const qs = params.toString();
  return useQuery({
    queryKey: ['invoices', filter?.status ?? null, filter?.overdue ?? false],
    queryFn: () => api.get<InvoiceListItem[]>(`/ledger/invoices${qs ? `?${qs}` : ''}`),
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

// ── Dunning (recordatorios de cobro, D4) ─────────────────────────────────────
/** Recordatorios de cobro del despacho (línea de tiempo); opcionalmente de una factura. */
export function useDunningReminders(invoiceId?: string) {
  return useQuery({
    queryKey: ['dunning-reminders', invoiceId ?? null],
    queryFn: () =>
      api.get<DunningReminder[]>(`/dunning/reminders${invoiceId ? `?invoiceId=${invoiceId}` : ''}`),
    enabled: invoiceId === undefined || Boolean(invoiceId),
  });
}

/** "Recordar ahora": persigue las vencidas del despacho y dispara los recordatorios debidos. */
export function useDunningRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DunningRunSummary>('/dunning/run'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dunning-reminders'] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    meta: { successToast: toastMsg.dunningRun },
  });
}

// ── Provisión de fondos / retainer (R5) ──────────────────────────────────────
/** Cuenta de provisión de un expediente: saldo + movimientos (`GET /retainer/matter/:id`). */
export function useMatterRetainer(matterId: string) {
  return useQuery({
    queryKey: ['retainer', 'matter', matterId],
    queryFn: () => api.get<RetainerAccount>(`/retainer/matter/${matterId}`),
    enabled: Boolean(matterId),
  });
}

/** Saldo agregado de provisión de un cliente (Σ de sus expedientes, `GET /retainer/client/:id`). */
export function useClientRetainer(clientId: string) {
  return useQuery({
    queryKey: ['retainer', 'client', clientId],
    queryFn: () => api.get<ClientRetainer>(`/retainer/client/${clientId}`),
    enabled: Boolean(clientId),
  });
}

/** Tras una operación de retainer, refresca el saldo y lo que depende de él (ledger, facturas). */
function invalidateRetainer(qc: ReturnType<typeof useQueryClient>, matterId: string) {
  void qc.invalidateQueries({ queryKey: ['retainer'] });
  void qc.invalidateQueries({ queryKey: ['ledger', matterId] });
  void qc.invalidateQueries({ queryKey: ['invoices'] });
}

/** Cobro de provisión NO fiscal (SUPLIDO/GENERICO) → suma al saldo. ANTICIPO va por `useRetainerAnticipo`. */
export function useRetainerDeposit(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amount: string;
      kind: Exclude<ProvisionKind, 'ANTICIPO'>;
      note?: string;
      currency?: 'EUR' | 'USD' | 'DOP';
    }) => api.post<{ balance: string }>('/retainer/deposit', { ...body, matterId }),
    onSuccess: () => invalidateRetainer(qc, matterId),
    meta: { successToast: toastMsg.depositRecorded },
  });
}

/** Cobro de ANTICIPO de honorarios: emite la factura de anticipo (Verifactu/e-CF) y acredita el saldo. */
export function useRetainerAnticipo(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amount: string;
      withholdingTaxCode?: string;
      description?: string;
      currency?: 'EUR' | 'USD' | 'DOP';
    }) =>
      api.post<{ invoiceId: string; number: string; total: string; balance: string }>(
        '/retainer/anticipo',
        { ...body, matterId },
      ),
    onSuccess: () => invalidateRetainer(qc, matterId),
  });
}

/** Aplica saldo de provisión (SUPLIDO/GENERICO) al cobro de una factura del expediente. */
export function useRetainerApply(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { invoiceId: string; amount?: string }) =>
      api.post<{ invoiceId: string; applied: string; invoiceStatus: string; balance: string }>(
        '/retainer/apply',
        { ...body, matterId },
      ),
    onSuccess: () => invalidateRetainer(qc, matterId),
  });
}

/** Factura final de cierre con DEDUCCIÓN del anticipo (R3b): servicio completo − anticipos, sin doble IVA. */
export function useRetainerFinalInvoice(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: InvoiceLineInput[]; withholdingTaxCode?: string }) =>
      api.post<{
        invoiceId: string;
        number: string;
        taxableBase: string;
        taxAmount: string;
        total: string;
        deducted: { invoiceNumber: string; base: string }[];
        balance: string;
      }>('/retainer/final-invoice', { ...body, matterId }),
    onSuccess: () => invalidateRetainer(qc, matterId),
  });
}

/** Devolución de un anticipo facturado (R3c): factura rectificativa por sustitución + REFUND(−). */
export function useRetainerRefund(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { anticipoInvoiceId: string; reason: string }) =>
      api.post<{
        invoiceId: string;
        number: string;
        rectifies: string;
        total: string;
        balance: string;
      }>('/retainer/refund', { ...body, matterId }),
    onSuccess: () => invalidateRetainer(qc, matterId),
  });
}

// ── Facturación programada (D-028, RP6) ──────────────────────────────────────
/** Planes de facturación de un expediente + nº de cuotas (`GET /billing/schedules?matterId=`). */
export function useMatterBillingSchedules(matterId: string) {
  return useQuery({
    queryKey: ['billing', 'schedules', matterId],
    queryFn: () =>
      api.get<BillingScheduleListItem[]>(
        `/billing/schedules?matterId=${encodeURIComponent(matterId)}`,
      ),
    enabled: Boolean(matterId),
  });
}

/** Un plan con su cuadro de cuotas (`GET /billing/schedules/:id`). Se habilita con `enabled`. */
export function useBillingSchedule(id: string, enabled = true) {
  return useQuery({
    queryKey: ['billing', 'schedule', id],
    queryFn: () => api.get<BillingSchedule>(`/billing/schedules/${id}`),
    enabled: enabled && Boolean(id),
  });
}

/** Tras crear/emitir/cobrar en un plan, refresca los planes del expediente, el ledger y las facturas. */
function invalidateBilling(qc: ReturnType<typeof useQueryClient>, matterId: string) {
  void qc.invalidateQueries({ queryKey: ['billing'] });
  void qc.invalidateQueries({ queryKey: ['ledger', matterId] });
  void qc.invalidateQueries({ queryKey: ['retainer'] });
  void qc.invalidateQueries({ queryKey: ['invoices'] });
}

/** Crea un plan (RECURRING/INSTALLMENTS) + genera su cuadro de cuotas (`POST /billing/schedules`). */
export function useCreateBillingSchedule(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<CreateBillingScheduleBody, 'matterId'>) =>
      api.post<BillingSchedule>('/billing/schedules', { ...body, matterId }),
    onSuccess: () => invalidateBilling(qc, matterId),
  });
}

/** Emite las facturas de los periodos vencidos (`POST /billing/schedules/:id/run`). */
export function useRunBillingSchedule(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      api.post<BillingRunResult>(`/billing/schedules/${scheduleId}/run`),
    onSuccess: () => invalidateBilling(qc, matterId),
  });
}

/** Cobra una cuota de un plan de pago por anticipos (`POST /billing/installments/:id/collect`). */
export function useCollectBillingInstallment(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (installmentId: string) =>
      api.post<BillingCollectResult>(`/billing/installments/${installmentId}/collect`),
    onSuccess: () => invalidateBilling(qc, matterId),
  });
}

// ── Cobro online (Stripe Connect, PR-4) ──────────────────────────────────────
/** Config de cobro online del tenant (online vs manual, por jurisdicción). */
export function usePaymentConfig() {
  return useQuery({
    queryKey: ['payments', 'config'],
    queryFn: () => api.get<PaymentConfig>('/payments/config'),
    staleTime: 60_000,
  });
}

/** Crea un enlace de pago Stripe para la factura y redirige al checkout. */
export function useCreateCheckout(invoiceId: string) {
  return useMutation({
    mutationFn: () => api.post<{ url: string }>('/payments/checkout', { invoiceId }),
  });
}

/** Estado de la conexión Stripe del despacho (Ajustes). */
export function useStripeStatus() {
  return useQuery({
    queryKey: ['payments', 'connect', 'status'],
    queryFn: () => api.get<StripeConnectStatus>('/payments/connect/status'),
  });
}

/** Inicia/continúa el onboarding de Stripe Connect y redirige al enlace de Stripe. */
export function useStripeOnboard() {
  return useMutation({
    mutationFn: () => api.post<{ url: string }>('/payments/connect/onboard'),
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
/** El cliente sube un documento a su propio expediente desde el portal. */
export function useUploadPortalDocument(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (name) form.append('name', name);
      return api.upload<MatterDocument>(`/portal/matters/${matterId}/documents`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'documents', matterId] }),
    meta: { successToast: toastMsg.documentUploaded },
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
/** Saldo de provisión de fondos del expediente propio del cliente (solo lectura, `GET …/retainer`). */
export function usePortalRetainer(id: string) {
  return useQuery({
    queryKey: ['portal', 'retainer', id],
    queryFn: () => api.get<RetainerAccount>(`/portal/matters/${id}/retainer`),
    enabled: Boolean(id),
  });
}
export function usePortalInvoices() {
  return useQuery({
    queryKey: ['portal', 'invoices'],
    queryFn: () => api.get<PortalInvoice[]>('/portal/invoices'),
  });
}

/** ¿Puede el cliente pagar online? (el despacho tiene pasarela + cuenta conectada). */
export function usePortalPaymentConfig() {
  return useQuery({
    queryKey: ['portal', 'payments', 'config'],
    queryFn: () => api.get<{ onlineEnabled: boolean }>('/portal/payments/config'),
    staleTime: 60_000,
  });
}

/** El cliente paga SU factura online: crea el checkout y redirige a Stripe. */
export function usePortalCheckout(invoiceId: string) {
  return useMutation({
    mutationFn: () => api.post<{ url: string }>(`/portal/invoices/${invoiceId}/checkout`),
  });
}

// ── Alta de cliente / expediente / acceso al portal (Tanda B) ─────────────────
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      taxId: string;
      docType?: 'PASSPORT' | 'OTHER';
      email?: string;
      phone?: string;
      address?: string;
    }) => api.post<Client>('/clients', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
    meta: { successToast: toastMsg.clientCreated },
  });
}

// ── Importación / migración de datos (CSV) ────────────────────────────────────
/** Dry-run de importación de clientes: valida el CSV y devuelve el detalle por fila (no escribe). */
export function useImportClientsPreview() {
  return useMutation({
    mutationFn: (csv: string) => api.post<ImportPreview>('/import/clients/preview', { csv }),
    meta: { skipErrorToast: true },
  });
}
/** Confirma la importación: crea los clientes válidos no duplicados. */
export function useImportClientsCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => api.post<ImportResult>('/import/clients/commit', { csv }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

// ── Captación / mini-CRM (leads) ──────────────────────────────────────────────
export function useLeads(status?: LeadStatus) {
  return useQuery({
    queryKey: ['leads', status ?? 'all'],
    queryFn: () => api.get<Lead[]>(`/leads${status ? `?status=${status}` : ''}`),
  });
}
export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      subject?: string;
      notes?: string;
      estimatedValue?: string;
    }) => api.post<Lead>('/leads', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
    meta: { successToast: toastMsg.leadCreated },
  });
}
export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: LeadStatus; notes?: string }) =>
      api.patch<Lead>(`/leads/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}
export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      taxId: string;
      docType?: 'PASSPORT' | 'OTHER';
      createMatter?: boolean;
      matterTitle?: string;
      matterType?: string;
    }) => api.post<{ clientId: string; matterId?: string }>(`/leads/${id}/convert`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['matters'] });
    },
  });
}
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/leads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}
export function useIntakeLink() {
  return useQuery({
    queryKey: ['intake-link'],
    queryFn: () => api.get<{ token: string }>('/leads/intake-link'),
  });
}

/** Token del feed iCal de la agenda (para suscribirse desde Google/Outlook/Apple). */
export function useCalendarFeedLink() {
  return useQuery({
    queryKey: ['calendar-feed-link'],
    queryFn: () => api.get<{ token: string }>('/calendar/feed-link'),
    staleTime: Infinity,
  });
}

type OAuthStatus = { configured: boolean; connected: boolean; email: string | null };

// ── Integración Google (OAuth: Calendar) ──────────────────────────────────────
export function useGoogleStatus() {
  return useQuery({
    queryKey: ['google-status'],
    queryFn: () => api.get<OAuthStatus>('/integrations/google/status'),
  });
}
export function useGoogleConnect() {
  return useMutation({
    mutationFn: () => api.get<{ url: string }>('/integrations/google/connect'),
  });
}
export function useGoogleDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del('/integrations/google'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['google-status'] });
      void qc.invalidateQueries({ queryKey: ['mail-status'] });
    },
  });
}
export function useGoogleCalendarSync() {
  return useMutation({
    mutationFn: () =>
      api.post<{ pushed: number; errors: number }>('/integrations/google/calendar/sync'),
  });
}

// ── Integración Microsoft 365 (OAuth: Outlook Calendar) ───────────────────────
export function useMicrosoftStatus() {
  return useQuery({
    queryKey: ['microsoft-status'],
    queryFn: () => api.get<OAuthStatus>('/integrations/microsoft/status'),
  });
}
export function useMicrosoftConnect() {
  return useMutation({
    mutationFn: () => api.get<{ url: string }>('/integrations/microsoft/connect'),
  });
}
export function useMicrosoftDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del('/integrations/microsoft'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['microsoft-status'] });
      void qc.invalidateQueries({ queryKey: ['mail-status'] });
    },
  });
}
export function useMicrosoftCalendarSync() {
  return useMutation({
    mutationFn: () =>
      api.post<{ pushed: number; errors: number }>('/integrations/microsoft/calendar/sync'),
  });
}

// ── Correspondencia del expediente (neutral: Google o Microsoft) ──────────────
export function useMailStatus() {
  return useQuery({
    queryKey: ['mail-status'],
    queryFn: () =>
      api.get<{ provider: 'google' | 'microsoft' | null; canAttach: boolean }>(
        '/integrations/mail/status',
      ),
  });
}
export function useMatterEmails(matterId: string) {
  return useQuery({
    queryKey: ['matter-emails', matterId],
    queryFn: () => api.get<MatterEmail[]>(`/integrations/mail/matters/${matterId}`),
    enabled: Boolean(matterId),
  });
}
export function useRecentMail(enabled: boolean) {
  return useQuery({
    queryKey: ['mail-recent'],
    queryFn: () => api.get<RecentEmail[]>('/integrations/mail/recent'),
    enabled,
    staleTime: 30_000,
  });
}
export function useAttachMail(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (externalId: string) =>
      api.post('/integrations/mail/attach', { matterId, externalId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter-emails', matterId] }),
  });
}
export function useSendMatterEmail(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { to: string; subject: string; body: string }) =>
      api.post(`/integrations/mail/matters/${matterId}/send`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter-emails', matterId] }),
  });
}

/** Campos de partes y procedimiento (todos opcionales) que comparten alta y edición de expediente. */
export type MatterPartiesInput = {
  opposingParty?: string;
  opposingPartyTaxId?: string;
  opposingCounsel?: string;
  court?: string;
  caseNumber?: string;
  proceduralPhase?: string;
};

export function useCreateMatter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: {
        title: string;
        type: string;
        clientId: string;
        lawyerId?: string;
      } & MatterPartiesInput,
    ) => api.post<Matter>('/matters', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['matters'] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
    meta: { successToast: toastMsg.matterCreated },
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
    meta: { successToast: toastMsg.portalCreated },
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
    meta: { successToast: toastMsg.staffCreated },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      isActive?: boolean;
      role?: StaffRole;
      billRate?: string;
      costRate?: string;
    }) => api.patch(`/users/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['seats'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/** Actualiza campos del expediente (título, tipo, presupuesto). PATCH /matters/:id. */
export function useUpdateMatter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: { title?: string; type?: string; budgetAmount?: string } & MatterPartiesInput,
    ) => api.patch<MatterDetail>(`/matters/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(['matter', id], data);
      void qc.invalidateQueries({ queryKey: ['matters'] });
    },
  });
}

/**
 * Cambio de contraseña self-service (staff y cliente de portal). Va por el BFF (no por `api`) para
 * que reescriba la cookie httpOnly del refresh; al terminar, actualiza el access token en memoria.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const token = getAccessToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) {
        const raw = (data as { message?: string | string[] } | undefined)?.message;
        const message = Array.isArray(raw) ? raw.join(', ') : (raw ?? `Error ${res.status}`);
        throw new ApiError(res.status, message, data);
      }
      setAccessToken((data as { accessToken: string }).accessToken);
    },
  });
}

/** Resultado de emitir un enlace de restablecimiento (reset por admin). */
export interface AdminResetResult {
  token: string;
  resetLink: string;
  expiresAt: string;
  email: string;
}

/** Reset por admin: emite un enlace de un solo uso para un usuario del despacho (staff o cliente). */
export function useAdminResetPassword() {
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<AdminResetResult>(`/auth/admin/reset-password/${userId}`),
  });
}

function publicApiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${base}/api${path}`;
}

/** Autoservicio "olvidé mi contraseña" (público). Siempre resuelve (respuesta genérica del servidor). */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      await fetch(publicApiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    },
  });
}

/** Aplica un token de restablecimiento con una nueva contraseña (público). */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (body: { token: string; newPassword: string }) => {
      const res = await fetch(publicApiUrl('/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) {
        const raw = (data as { message?: string | string[] } | undefined)?.message;
        const message = Array.isArray(raw) ? raw.join(', ') : (raw ?? `Error ${res.status}`);
        throw new ApiError(res.status, message, data);
      }
    },
  });
}

/** Confirma el email a partir del token del correo (público; no requiere sesión). */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(publicApiUrl('/auth/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) {
        const raw = (data as { message?: string | string[] } | undefined)?.message;
        const message = Array.isArray(raw) ? raw.join(', ') : (raw ?? `Error ${res.status}`);
        throw new ApiError(res.status, message, data);
      }
    },
  });
}

// ── Comprobación de conflictos (Tanda B) ──────────────────────────────────────
export function useConflictCheck(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['conflicts', q],
    queryFn: () => api.get<ConflictResult>(`/clients/conflict-check?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 3,
    staleTime: 30_000,
  });
}

// ── Ajustes del despacho (Tanda B, solo admin) ────────────────────────────────
export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<FirmSettings>('/settings') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      taxId?: string;
      locale?: string;
      invoiceSeries?: string;
      deadlineEmailRemindersEnabled?: boolean;
    }) => api.patch<FirmSettings>('/settings', body),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
    meta: { successToast: toastMsg.settingsSaved },
  });
}

export function useAddHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; name: string }) =>
      api.post<FirmSettings>('/settings/holidays', body),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  });
}

export function useRemoveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.del<FirmSettings>(`/settings/holidays/${date}`),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  });
}

export function useUploadCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<FirmSettings>('/settings/certificate', form);
    },
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
    // Multipart: además del coste, un justificante opcional (foto del ticket/tasa).
    mutationFn: (body: {
      description: string;
      amount: string;
      note?: string;
      file?: File | null;
    }) => {
      const form = new FormData();
      form.append('matterId', matterId);
      form.append('description', body.description);
      form.append('amount', body.amount);
      if (body.note) form.append('note', body.note);
      if (body.file) form.append('receipt', body.file);
      return api.upload('/ledger/costs/propose', form);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ledger', matterId] });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    meta: { successToast: toastMsg.costProposed },
  });
}

/** Abre el justificante de un suplido en una pestaña nueva (descarga con auth → object URL). */
export async function openReceipt(entryId: string): Promise<void> {
  const blob = await api.download(`/ledger/costs/${entryId}/receipt`);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

/**
 * Descarga el PDF de una factura (despacho: `/ledger/invoices/:id/pdf`; portal:
 * `/portal/invoices/:id/pdf`) y dispara la descarga en el navegador.
 */
export async function downloadInvoicePdf(path: string, filename: string): Promise<void> {
  const blob = await api.download(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * RGPD/Ley 172-13 — descarga el export de datos del titular (`GET /clients/:id/gdpr-export`,
 * portabilidad) como JSON. El backend ya restringe a FIRM_ADMIN.
 */
export async function downloadGdprExport(clientId: string, filename: string): Promise<void> {
  const data = await api.get<unknown>(`/clients/${clientId}/gdpr-export`);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Suscripción (SaaS de plataforma) ──────────────────────────────────────────

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get<SubscriptionInfo>('/subscription'),
    staleTime: 30_000,
  });
}

/** Inicia el Checkout de Stripe (plazas + ciclo + fundador) y devuelve la URL de pago. */
export function useCheckout() {
  return useMutation({
    mutationFn: (req: CheckoutRequest) => api.post<{ url: string }>('/subscription/checkout', req),
  });
}

/** Abre el portal de Stripe (gestionar método de pago/facturas). */
export function usePortal() {
  return useMutation({ mutationFn: () => api.post<{ url: string }>('/subscription/portal') });
}

/** Cancela la suscripción al final del periodo (conserva acceso hasta entonces). */
export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ cancelAtPeriodEnd: true }>('/subscription/cancel'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });
}

/** Deshace una cancelación programada y reanuda la suscripción. */
export function useResumeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ cancelAtPeriodEnd: false }>('/subscription/resume'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });
}

/** Ajusta el nº de plazas contratadas (prorrateado en la próxima factura). */
export function useChangeSeats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seats: number) => api.post<{ seats: number }>('/subscription/seats', { seats }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });
}

// ── IA (asistente / resúmenes / redacción / búsqueda semántica) ──────────────
/** ¿Está la IA habilitada y con qué modelo? Para mostrar/ocultar las features de IA. */
export function useAiStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => api.get<AiStatus>('/ai/status'),
    staleTime: 300_000,
  });
}

/** Pregunta libre sobre un expediente. */
export function useAskMatter(matterId: string) {
  return useMutation({
    mutationFn: (question: string) =>
      api.post<AiResponse>(`/ai/matters/${matterId}/ask`, { question }),
  });
}

/** Resumen del expediente. */
export function useSummarizeMatter(matterId: string) {
  return useMutation({
    mutationFn: () => api.post<AiResponse>(`/ai/matters/${matterId}/summary`),
  });
}

/** Resumen/extracción de un documento. */
export function useSummarizeDocument() {
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post<AiResponse>(`/ai/documents/${documentId}/summarize`),
  });
}

/** Borrador de escrito a partir de una plantilla + contexto del expediente. */
export function useDraftFromTemplate() {
  return useMutation({
    mutationFn: (v: { templateId: string; matterId: string; instructions?: string }) =>
      api.post<AiResponse>(`/ai/templates/${v.templateId}/draft`, {
        matterId: v.matterId,
        instructions: v.instructions,
      }),
  });
}

/** Borrador de correo (asunto + cuerpo). */
export function useDraftEmail() {
  return useMutation({
    mutationFn: (v: { instructions: string; matterId?: string }) =>
      api.post<AiEmailDraft>('/ai/email/draft', v),
  });
}

/** Búsqueda semántica en lo indexado del despacho. */
export function useSemanticSearch() {
  return useMutation({
    mutationFn: (v: { query: string; limit?: number }) => api.post<SemanticHit[]>('/ai/search', v),
  });
}

/** (Re)indexa un expediente para la búsqueda semántica. */
export function useIndexMatter() {
  return useMutation({
    mutationFn: (matterId: string) => api.post<{ chunks: number }>(`/ai/index/matters/${matterId}`),
  });
}

// ── Facturación electrónica RD (e-CF · DGII) ──────────────────────────────────

export type DgiiStatusResponse = {
  enabled: boolean;
  environment: string | null;
  certificate: { uploaded: boolean; name: string | null; uploadedAt: string | null };
};

export function useDgiiStatus() {
  return useQuery({
    queryKey: ['dgii-status'],
    queryFn: () => api.get<DgiiStatusResponse>('/dgii/status'),
  });
}

export function useUploadDgiiCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, password }: { file: File; password: string }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('password', password);
      return api.upload<{ commonName: string | null }>('/dgii/certificate', form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dgii-status'] }),
  });
}

export function useTransmitEcf(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ status: string; detail?: string }>(`/dgii/invoices/${invoiceId}/transmit`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useRefreshEcf(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ status: string; detail?: string }>(`/dgii/invoices/${invoiceId}/refresh`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['invoice', invoiceId] }),
  });
}
