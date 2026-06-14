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
