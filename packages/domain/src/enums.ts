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
  /** Cobro de una factura aplicando saldo de provisión de fondos (retainer). Ver D-026. */
  RETAINER = 'RETAINER',
}

/**
 * Canal por el que se entrega un recordatorio de cobro (dunning). Agnóstico: hoy solo IN_APP está
 * implementado; EMAIL/SMS quedan reservados como punto de integración para Fase 2 (cuando exista el
 * canal, el motor de dunning se engancha sin tocar el modelo).
 */
export enum DunningChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

/**
 * Severidad/escalado de un recordatorio de cobro. Ordena el tono del aviso conforme crece el retraso.
 * - REMINDER: recordatorio amable (primer aviso).
 * - WARNING: aviso de mora.
 * - FINAL: aviso final previo a acciones de recobro.
 */
export enum DunningSeverity {
  REMINDER = 'REMINDER',
  WARNING = 'WARNING',
  FINAL = 'FINAL',
}

/**
 * Estado de un recordatorio de cobro concreto sobre una factura.
 * - SCHEDULED: generado/planificado, aún sin entregar por el canal.
 * - SENT: entregado por el canal correspondiente.
 * - SKIPPED: omitido (p. ej. la factura se cobró antes de disparar la etapa).
 * - FAILED: el canal falló al entregar (relevante con EMAIL/SMS en Fase 2).
 */
export enum DunningReminderStatus {
  SCHEDULED = 'SCHEDULED',
  SENT = 'SENT',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

/**
 * Movimiento del saldo de provisión de fondos (retainer) de un expediente. Convención de signo:
 * - DEPOSIT (+): anticipo cobrado al cliente (manual o, en Fase posterior, online).
 * - APPLICATION (−): provisión aplicada a una factura (liquida saldo pendiente de la factura).
 * - REFUND (−): devolución de provisión al cliente.
 * - ADJUSTMENT (±): ajuste manual (el importe lleva su propio signo).
 */
export enum RetainerMovementType {
  DEPOSIT = 'DEPOSIT',
  APPLICATION = 'APPLICATION',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

/**
 * Naturaleza fiscal de un depósito de provisión de fondos (la fija el despacho al cobrar). Determina el
 * tratamiento fiscal (ver D-026, ratificada):
 * - ANTICIPO: anticipo de honorarios por servicios identificados → devenga IVA/ITBIS al cobro y EXIGE
 *   emisión de factura de anticipo (vía ComplianceProvider). El camino ANTICIPO se habilita en R2b; en
 *   R2 está bloqueado (un anticipo nunca puede registrarse como saldo sin su factura).
 * - SUPLIDO: gasto pagado en nombre y por cuenta del cliente (art. 78.Tres.3º LIVA) → fuera de base, sin
 *   IVA, justificante a nombre del cliente.
 * - GENERICO: provisión genérica no delimitada (sin servicio identificado) → sin devengo hasta
 *   identificar el servicio (doctrina TJUE C-419/02 BUPA). Caso raro en abogacía.
 */
export enum ProvisionKind {
  ANTICIPO = 'ANTICIPO',
  SUPLIDO = 'SUPLIDO',
  GENERICO = 'GENERICO',
}

/**
 * Tipo de documento de factura (Verifactu / e-CF). NORMAL es el caso general; RECTIFICATIVA corrige una
 * factura ya emitida (p. ej. devolución de un anticipo facturado, D-027 (c)). Bajo Verifactu las facturas
 * no se modifican/borran: la rectificativa es un REGISTRO NUEVO encadenado que referencia la rectificada.
 */
export enum InvoiceDocumentType {
  NORMAL = 'NORMAL',
  RECTIFICATIVA = 'RECTIFICATIVA',
}

/**
 * Método de la factura rectificativa (D-027 (c)):
 * - SUSTITUCION: la rectificativa sustituye a la rectificada (la errónea en negativo + la rectificativa).
 *   Es el método de R3c para la devolución total de un anticipo.
 * - DIFERENCIAS: la rectificativa recoge solo el delta (refund parcial). Reservado; no implementado en R3c.
 */
export enum RectificationMode {
  SUSTITUCION = 'SUSTITUCION',
  DIFERENCIAS = 'DIFERENCIAS',
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
