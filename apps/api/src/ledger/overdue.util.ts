import { InvoiceStatus } from '@legalflow/domain';

/**
 * Lógica de vencimiento de facturas, compartida por el ledger (vista "Vencidas", derivada en lectura)
 * y por el motor de dunning. Fuente única: no duplicar el cálculo de "vencida" en otros módulos.
 */

/** Plazo de pago por defecto (días) cuando la factura no trae `dueDate` explícito. */
export const DEFAULT_PAYMENT_TERM_DAYS = 30;

/** Estados en los que una factura ya no puede vencer (cobrada o anulada). */
export const SETTLED_STATUSES: InvoiceStatus[] = [InvoiceStatus.PAID, InvoiceStatus.CANCELLED];

/** Medianoche UTC de hoy: una factura vence cuando su `dueDate` quedó ESTRICTAMENTE en el pasado
 *  (el propio día de vencimiento aún no cuenta como vencida). */
export function startOfTodayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export function addDaysUtc(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

/** Deriva si una factura está vencida en lectura, sin depender del scheduler de dunning. */
export function deriveOverdue(
  status: InvoiceStatus,
  dueDate: Date | null,
  today: Date = startOfTodayUtc(),
): boolean {
  if (!dueDate || SETTLED_STATUSES.includes(status)) return false;
  return dueDate.getTime() < today.getTime();
}
