import type { AuthUser } from './auth-types';
import type { InvoiceStatus, LedgerEntryType } from './types';
import type { BadgeProps } from '@/components/ui/badge';

/** Signo del apunte para el saldo (espejo de la convención del backend). INVOICE no mueve saldo. */
export const BALANCE_SIGN: Record<LedgerEntryType, number> = {
  PROVISION: 1,
  PAYMENT: 1,
  DISBURSEMENT: -1,
  TIME_FEE: -1,
  FEE: -1,
  ADJUSTMENT: 1,
  INVOICE: 0,
};

/** Tipos de apunte que el usuario puede crear (no TIME_FEE ni INVOICE, que son del sistema). */
export const MANUAL_ENTRY_TYPES: LedgerEntryType[] = [
  'PROVISION',
  'DISBURSEMENT',
  'FEE',
  'PAYMENT',
  'ADJUSTMENT',
];

export function entryTypeVariant(type: LedgerEntryType): NonNullable<BadgeProps['variant']> {
  switch (type) {
    case 'PROVISION':
    case 'PAYMENT':
      return 'success';
    case 'DISBURSEMENT':
    case 'TIME_FEE':
    case 'FEE':
      return 'warning';
    case 'INVOICE':
      return 'info';
    case 'ADJUSTMENT':
      return 'secondary';
  }
}

export function invoiceStatusVariant(status: InvoiceStatus): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'DRAFT':
      return 'secondary';
    case 'ISSUED':
    case 'SENT':
      return 'info';
    case 'PARTIAL':
      return 'warning';
    case 'OVERDUE':
      return 'danger';
    case 'PAID':
      return 'success';
    case 'CANCELLED':
      return 'outline';
  }
}

/** Variante de badge para el estado de transmisión del e-CF a la DGII. */
export function ecfStatusVariant(status: string): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'ACCEPTED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REJECTED':
      return 'danger';
    case 'STUBBED':
      return 'info';
    default:
      return 'secondary';
  }
}

/** Códigos fiscales por defecto según la jurisdicción del tenant (no hardcodear país en la UI). */
export function defaultTaxCodes(jurisdiction: AuthUser['jurisdiction']): {
  taxCode: string;
  withholdingTaxCode?: string;
} {
  return jurisdiction === 'es'
    ? { taxCode: 'IVA_STANDARD', withholdingTaxCode: 'IRPF_GENERAL' }
    : { taxCode: 'ITBIS_STANDARD' };
}
