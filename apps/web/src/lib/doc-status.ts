import type { DocumentReviewStatus } from './types';
import type { BadgeProps } from '@/components/ui/badge';

/** Variante de Badge por estado de revisión de documento. */
export function docStatusVariant(status: DocumentReviewStatus): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'PENDING':
      return 'secondary';
    case 'IN_REVIEW':
      return 'info';
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'CHANGES_REQUESTED':
      return 'warning';
  }
}

/** Estados que un revisor puede fijar (PENDING no es un destino de revisión válido). */
export const REVIEW_ACTIONS: DocumentReviewStatus[] = [
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'IN_REVIEW',
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Etiqueta corta del tipo de archivo (DOCX, PDF, …) a partir del MIME, para los chips. */
export function mimeLabel(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'text/plain': 'TXT',
    'image/png': 'PNG',
    'image/jpeg': 'JPG',
  };
  if (map[mime]) return map[mime];
  const sub = mime.split('/')[1] ?? mime;
  return sub.slice(0, 4).toUpperCase();
}
