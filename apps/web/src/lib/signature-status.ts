import type { SignatureStatus } from './types';
import type { BadgeProps } from '@/components/ui/badge';

/** Variante de Badge por estado de una solicitud de firma electrónica. */
export function signatureStatusVariant(
  status: SignatureStatus,
): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'SIGNED':
      return 'success';
    case 'PENDING':
    case 'STUBBED':
      return 'info';
    case 'DECLINED':
      return 'danger';
    case 'EXPIRED':
      return 'warning';
    case 'CANCELED':
      return 'secondary';
  }
}

/** Una solicitud sigue viva (cancelable) si aún no es terminal. */
export function isSignaturePending(status: SignatureStatus): boolean {
  return status === 'PENDING' || status === 'STUBBED';
}

/** Una solicitud terminal sin firma (rechazada/caducada/cancelada) admite reenvío al mismo firmante. */
export function isSignatureResendable(status: SignatureStatus): boolean {
  return status === 'DECLINED' || status === 'EXPIRED' || status === 'CANCELED';
}
