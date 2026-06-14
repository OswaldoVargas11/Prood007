'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  DocumentReviewStatus,
  Matter,
  MatterDetail,
  MatterDocument,
  MatterStatus,
  Paginated,
} from './types';

/** Conteo barato para KPIs (pide 1 elemento y usa `total`). */
export function useResourceCount(resource: 'clients' | 'matters') {
  return useQuery({
    queryKey: [resource, 'count'],
    queryFn: () => api.get<Paginated<unknown>>(`/${resource}?page=1&pageSize=1`),
  });
}

export function useMatters(
  params: { page?: number; pageSize?: number; status?: MatterStatus } = {},
) {
  const { page = 1, pageSize = 20, status } = params;
  return useQuery({
    queryKey: ['matters', { page, pageSize, status: status ?? null }],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) qs.set('status', status);
      return api.get<Paginated<Matter>>(`/matters?${qs.toString()}`);
    },
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
