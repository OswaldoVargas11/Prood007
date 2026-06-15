/**
 * Enums del dominio — AGNÓSTICOS de jurisdicción.
 * Nada aquí debe codificar una ley concreta de un país. Lo específico (tipos de impuesto,
 * formatos de registro fiscal, etc.) vive en `@legalflow/compliance`.
 */

/** Jurisdicción del tenant. Selecciona el ComplianceProvider en runtime. */
export enum Jurisdiction {
  ES = 'es',
  DO = 'do',
}

/** Moneda a nivel de tenant. */
export enum Currency {
  EUR = 'EUR',
  DOP = 'DOP',
}

/** Roles base del RBAC. */
export enum Role {
  CLIENT = 'CLIENT',
  LAWYER = 'LAWYER',
  FIRM_ADMIN = 'FIRM_ADMIN',
}

/** Estado del expediente (ciclo de vida agnóstico). */
export enum MatterStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

/** Estado de revisión de una versión de documento. */
export enum DocumentReviewStatus {
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
}

/** Estado de una tarea. */
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

/**
 * Tipo de apunte del ledger jurídico (transparente para el cliente).
 * - PROVISION: provisión de fondos (anticipo del cliente).
 * - DISBURSEMENT: suplido (gasto pagado por cuenta del cliente).
 * - TIME_FEE: honorarios por horas trabajadas (con tarifa).
 * - FEE: honorario fijo.
 * - INVOICE: emisión de factura.
 * - PAYMENT: cobro.
 * - ADJUSTMENT: ajuste/abono.
 */
export enum LedgerEntryType {
  PROVISION = 'PROVISION',
  DISBURSEMENT = 'DISBURSEMENT',
  TIME_FEE = 'TIME_FEE',
  FEE = 'FEE',
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
  ADJUSTMENT = 'ADJUSTMENT',
}

/**
 * Estado de la factura.
 * - DRAFT/ISSUED/SENT: emitida y pendiente de cobro.
 * - PARTIAL: cobrada en parte (amountPaid > 0 y < total).
 * - OVERDUE: vencida sin cobro completo (dueDate pasada). Lo fija el scheduler de dunning;
 *   la vista de "vencidas" también lo deriva en lectura desde dueDate.
 * - PAID: cobrada por completo. CANCELLED: anulada.
 */
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  SENT = 'SENT',
  PARTIAL = 'PARTIAL',
  OVERDUE = 'OVERDUE',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

/** Estado de aprobación de un apunte del ledger (flujo de aprobación de costes). */
export enum ApprovalStatus {
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Estado de un cobro (Payment) sobre una factura.
 * - PENDING: iniciado (p. ej. checkout creado) y a la espera de confirmación de la pasarela.
 * - SUCCEEDED: cobrado y conciliado (mueve `amountPaid` de la factura).
 * - FAILED: rechazado/cancelado por la pasarela.
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

/**
 * Método/origen del cobro. Agnóstico de pasarela: el adaptador concreto (Stripe, Azul…) lo fija.
 * - MANUAL: registrado a mano por el despacho (transferencia, efectivo, conciliación offline).
 * - STRIPE: cobro online vía Stripe (ES).
 */
export enum PaymentMethod {
  MANUAL = 'MANUAL',
  STRIPE = 'STRIPE',
}

/** Tipo de identificador fiscal (validado por el provider de cumplimiento). */
export enum TaxIdKind {
  /** España */
  NIF = 'NIF',
  CIF = 'CIF',
  NIE = 'NIE',
  /** República Dominicana */
  RNC = 'RNC',
  CEDULA = 'CEDULA',
}
