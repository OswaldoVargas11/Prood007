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

/** Monedas soportadas para facturar (moneda por defecto del tenant + elegible por factura). */
export enum Currency {
  EUR = 'EUR',
  USD = 'USD',
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

/**
 * Naturaleza de cada partida del checklist de cierre de una operación transaccional (M&A,
 * inmobiliario, financiación): condición previa, entregable, hoja de firmas u otra.
 */
export enum ClosingItemCategory {
  CONDITION_PRECEDENT = 'CONDITION_PRECEDENT',
  DELIVERABLE = 'DELIVERABLE',
  SIGNATURE_PAGE = 'SIGNATURE_PAGE',
  OTHER = 'OTHER',
}

/**
 * Estado de una partida del checklist de cierre.
 * - WAIVED: la parte renuncia/dispensa la condición.
 * - SATISFIED: cumplida (condición), entregada (entregable) o firmada (hoja de firmas).
 */
export enum ClosingItemStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  WAIVED = 'WAIVED',
  SATISFIED = 'SATISFIED',
}

/**
 * Fase de la operación en la que opera una partida del checklist de cierre. Separa el SIGNING (firma de
 * los contratos) del CLOSING (consumación: pago, entrega, elevación a público) — distinción nuclear de un
 * transaccional. POST_CLOSING agrupa las obligaciones posteriores al cierre (inscripciones, saneamientos).
 */
export enum ClosingItemPhase {
  AT_SIGNING = 'AT_SIGNING',
  AT_CLOSING = 'AT_CLOSING',
  POST_CLOSING = 'POST_CLOSING',
}

/** Lado de una parte en la operación (working group list). */
export enum DealPartySide {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  COMPANY = 'COMPANY',
  LENDER = 'LENDER',
  BORROWER = 'BORROWER',
  OTHER = 'OTHER',
}

/** Rol de una parte dentro de su lado (principal, asesor legal, asesor financiero, notaría…). */
export enum DealPartyRole {
  PRINCIPAL = 'PRINCIPAL',
  LEGAL_COUNSEL = 'LEGAL_COUNSEL',
  FINANCIAL_ADVISOR = 'FINANCIAL_ADVISOR',
  NOTARY = 'NOTARY',
  OTHER = 'OTHER',
}

/**
 * Naturaleza de un hito del calendario de la operación. NO son plazos procesales (días hábiles, festivos,
 * calendario judicial): son fechas de la transacción computadas en días naturales — con la LONGSTOP
 * (drop-dead date) como hito límite a partir del cual cualquiera de las partes puede desistir.
 */
export enum DealMilestoneKind {
  SIGNING = 'SIGNING',
  CLOSING = 'CLOSING',
  LONGSTOP = 'LONGSTOP',
  CONDITIONS_DEADLINE = 'CONDITIONS_DEADLINE',
  FUNDS_FLOW = 'FUNDS_FLOW',
  FILING = 'FILING',
  CUSTOM = 'CUSTOM',
}

/** Estado de un hito de la operación. */
export enum DealMilestoneStatus {
  PENDING = 'PENDING',
  DONE = 'DONE',
  MISSED = 'MISSED',
}

/**
 * Registro/oficina pública con la que engancha una obligación o presentación, por jurisdicción.
 * ES: Registro Mercantil, Registro de la Propiedad, notaría e índice único notarial.
 * RD: Registro de Títulos (jurisdicción inmobiliaria) y Cámara de Comercio y Producción.
 */
export enum RegistryKind {
  REGISTRO_MERCANTIL = 'REGISTRO_MERCANTIL',
  REGISTRO_PROPIEDAD = 'REGISTRO_PROPIEDAD',
  INDICE_UNICO_NOTARIAL = 'INDICE_UNICO_NOTARIAL',
  NOTARIA = 'NOTARIA',
  REGISTRO_TITULOS_RD = 'REGISTRO_TITULOS_RD',
  CAMARA_COMERCIO_RD = 'CAMARA_COMERCIO_RD',
  OTHER = 'OTHER',
}

/** Estado de una presentación registral a nivel de operación. */
export enum RegistryFilingStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  REGISTERED = 'REGISTERED',
  REJECTED = 'REJECTED',
}

/** Estado de un anexo de manifestaciones (disclosure schedule). */
export enum DisclosureScheduleStatus {
  DRAFT = 'DRAFT',
  AGREED = 'AGREED',
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
 * Facturación programada (un único motor cubre ambos):
 * - RECURRING: servicio continuado (iguala) → 1 factura por periodo (devengo cada periodo).
 * - INSTALLMENTS: fraccionar un importe; el tratamiento fiscal lo fija `BillingFiscalMode`.
 */
export enum BillingScheduleType {
  RECURRING = 'RECURRING',
  INSTALLMENTS = 'INSTALLMENTS',
}

/**
 * Tratamiento fiscal del fraccionamiento (solo INSTALLMENTS; ver D-026/D-027):
 * - SERVICE_RENDERED: servicio ya prestado → 1 factura (IVA completo al emitir) + cuotas como cobros.
 * - ADVANCE: cobro por adelantado → factura de anticipo por cuota (devengo al cobro, R2b) + deducción
 *   en la final (R3b).
 */
export enum BillingFiscalMode {
  SERVICE_RENDERED = 'SERVICE_RENDERED',
  ADVANCE = 'ADVANCE',
}

/** Cadencia de un plan recurrente (cada `intervalCount` × `intervalUnit`). */
export enum BillingInterval {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

/** Estado del plan de facturación programada. */
export enum BillingScheduleStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Estado de una cuota/periodo del plan. */
export enum BillingInstallmentStatus {
  SCHEDULED = 'SCHEDULED',
  EMITTED = 'EMITTED',
  PAID = 'PAID',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
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

/** Tipo de identificador fiscal o documento de identidad (validado por el provider de cumplimiento). */
export enum TaxIdKind {
  /** España */
  NIF = 'NIF',
  CIF = 'CIF',
  NIE = 'NIE',
  /** República Dominicana */
  RNC = 'RNC',
  CEDULA = 'CEDULA',
  /** Transfronterizos (validación ligera, sin dígito de control). Para clientes extranjeros. */
  PASSPORT = 'PASSPORT',
  OTHER = 'OTHER',
}

/**
 * Contexto de una carpeta del sistema de ficheros: documentos de un expediente o plantillas del
 * despacho. Una carpeta sirve un único contexto (no se mezclan documentos y plantillas).
 */
export enum FolderKind {
  DOCUMENT = 'DOCUMENT',
  TEMPLATE = 'TEMPLATE',
}

/**
 * Estado de un requisito documental de una checklist de presentación aplicada a un expediente.
 * - PENDING: aún no aportado.
 * - UPLOADED: aportado (normalmente con un documento enlazado).
 * - NA: no aplica a este expediente.
 */
export enum ChecklistItemStatus {
  PENDING = 'PENDING',
  UPLOADED = 'UPLOADED',
  NA = 'NA',
}

/** Embudo de captación (mini-CRM): estado de un prospecto (lead). */
export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST',
}
