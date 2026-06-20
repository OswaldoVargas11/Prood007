/**
 * Catálogo i18n de mensajes de la API (E8).
 *
 * REGLA: ninguna respuesta de la API debe llevar un string de error hardcodeado como única fuente.
 * Cada error se identifica por una `messageKey` estable y traducible; el catálogo tiene la traducción
 * COMPLETA en las dos jurisdicciones soportadas (`es-ES`, `es-DO`). El campo `message` que viaja en la
 * respuesta es solo un fallback legible (es-ES) para clientes que no traduzcan; la fuente de verdad
 * para la UI es `messageKey` (+ `params` cuando el mensaje es interpolado).
 *
 * Las plantillas con marcadores `{x}` se interpolan en el cliente con `params`; el `message` fallback
 * que construye cada caller ya viene resuelto en es-ES.
 */
export const SUPPORTED_LOCALES = ['es-ES', 'es-DO'] as const;
export type ApiLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: ApiLocale = 'es-ES';

/** Catálogo: cada clave → texto por locale. `es-DO` regionaliza donde aplica (p. ej. «abogado» vs «letrado»). */
export const API_MESSAGES = {
  // ── Validación de entrada (class-validator) ───────────────────────────────
  'validation.failed': {
    'es-ES': 'Datos de entrada no válidos.',
    'es-DO': 'Datos de entrada no válidos.',
  },

  // ── Auth / RBAC ───────────────────────────────────────────────────────────
  'auth.invalidCredentials': {
    'es-ES': 'Credenciales inválidas.',
    'es-DO': 'Credenciales inválidas.',
  },
  'auth.chooseTenant': {
    'es-ES': 'Tu cuenta existe en varios despachos. Elige con cuál quieres iniciar sesión.',
    'es-DO': 'Tu cuenta existe en varios despachos. Elige con cuál quieres iniciar sesión.',
  },
  'mfa.invalidCode': {
    'es-ES': 'Código de verificación incorrecto.',
    'es-DO': 'Código de verificación incorrecto.',
  },
  'mfa.invalidChallenge': {
    'es-ES': 'La verificación ha caducado. Vuelve a iniciar sesión.',
    'es-DO': 'La verificación ha caducado. Vuelve a iniciar sesión.',
  },
  'mfa.notStarted': {
    'es-ES': 'No has iniciado la configuración de la verificación en dos pasos.',
    'es-DO': 'No has iniciado la configuración de la verificación en dos pasos.',
  },
  'mfa.alreadyEnabled': {
    'es-ES': 'La verificación en dos pasos ya está activada.',
    'es-DO': 'La verificación en dos pasos ya está activada.',
  },
  'mfa.notEnabled': {
    'es-ES': 'La verificación en dos pasos no está activada.',
    'es-DO': 'La verificación en dos pasos no está activada.',
  },
  'mfa.notConfigured': {
    'es-ES': 'La verificación en dos pasos no está disponible en el servidor.',
    'es-DO': 'La verificación en dos pasos no está disponible en el servidor.',
  },
  'auth.accountDisabled': {
    'es-ES': 'Cuenta deshabilitada.',
    'es-DO': 'Cuenta deshabilitada.',
  },
  'auth.notAuthenticated': {
    'es-ES': 'No autenticado.',
    'es-DO': 'No autenticado.',
  },
  'auth.forbidden': {
    'es-ES': 'No tienes permisos para esta acción.',
    'es-DO': 'No tienes permisos para esta acción.',
  },
  'auth.invalidToken': {
    'es-ES': 'Token inválido.',
    'es-DO': 'Token inválido.',
  },
  'auth.refreshInvalid': {
    'es-ES': 'Refresh token inválido o expirado.',
    'es-DO': 'Refresh token inválido o expirado.',
  },
  'auth.refreshUnknown': {
    'es-ES': 'Refresh token desconocido.',
    'es-DO': 'Refresh token desconocido.',
  },
  'auth.refreshReused': {
    'es-ES': 'Refresh token reutilizado; sesiones revocadas.',
    'es-DO': 'Refresh token reutilizado; sesiones revocadas.',
  },
  'auth.refreshExpired': {
    'es-ES': 'Refresh token expirado.',
    'es-DO': 'Refresh token expirado.',
  },
  'auth.sessionExpired': {
    'es-ES': 'La sesión ha alcanzado su duración máxima; vuelve a iniciar sesión.',
    'es-DO': 'La sesión ha alcanzado su duración máxima; vuelve a iniciar sesión.',
  },
  'auth.resetInvalid': {
    'es-ES': 'El enlace de restablecimiento no es válido o ha caducado.',
    'es-DO': 'El enlace de restablecimiento no es válido o ha caducado.',
  },
  'auth.invalidUser': {
    'es-ES': 'Usuario no válido.',
    'es-DO': 'Usuario no válido.',
  },
  'auth.currentPasswordInvalid': {
    'es-ES': 'La contraseña actual no es correcta.',
    'es-DO': 'La contraseña actual no es correcta.',
  },
  'auth.passwordSameAsOld': {
    'es-ES': 'La nueva contraseña debe ser distinta de la actual.',
    'es-DO': 'La nueva contraseña debe ser distinta de la actual.',
  },
  'auth.tokenStale': {
    'es-ES': 'La sesión ya no es válida; vuelve a iniciar sesión.',
    'es-DO': 'La sesión ya no es válida; vuelve a iniciar sesión.',
  },
  'auth.accountLocked': {
    'es-ES': 'Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo de nuevo más tarde.',
    'es-DO': 'Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo de nuevo más tarde.',
  },
  'auth.passwordBreached': {
    'es-ES': 'Esta contraseña aparece en filtraciones públicas conocidas; elige otra distinta.',
    'es-DO': 'Esta contraseña aparece en filtraciones públicas conocidas; elige otra distinta.',
  },

  // ── Clientes ──────────────────────────────────────────────────────────────
  'clients.taxIdInvalid': {
    'es-ES': 'Identificador fiscal no válido para la jurisdicción del despacho.',
    'es-DO': 'Identificador fiscal no válido para la jurisdicción del despacho.',
  },
  'clients.docInvalid': {
    'es-ES': 'Documento no válido. Usa de 5 a 20 caracteres (letras y números).',
    'es-DO': 'Documento no válido. Usa de 5 a 20 caracteres (letras y números).',
  },

  // ── Captación / CRM ─────────────────────────────────────────────────────────
  'leads.notFound': {
    'es-ES': 'Prospecto no encontrado.',
    'es-DO': 'Prospecto no encontrado.',
  },
  'leads.alreadyConverted': {
    'es-ES': 'Este prospecto ya fue convertido en cliente.',
    'es-DO': 'Este prospecto ya fue convertido en cliente.',
  },
  'leads.intakeNotFound': {
    'es-ES': 'Formulario de captación no disponible.',
    'es-DO': 'Formulario de captación no disponible.',
  },
  'clients.notFound': {
    'es-ES': 'Cliente no encontrado.',
    'es-DO': 'Cliente no encontrado.',
  },
  'clients.alreadyAnonymized': {
    'es-ES': 'Este cliente ya está anonimizado.',
    'es-DO': 'Este cliente ya está anonimizado.',
  },
  'clients.portalAlreadyExists': {
    'es-ES': 'Este cliente ya tiene acceso al portal.',
    'es-DO': 'Este cliente ya tiene acceso al portal.',
  },

  // ── Expedientes ───────────────────────────────────────────────────────────
  'matters.notInFirm': {
    'es-ES': 'El expediente no existe en este despacho.',
    'es-DO': 'El expediente no existe en este despacho.',
  },
  'matters.notFound': {
    'es-ES': 'Expediente no encontrado.',
    'es-DO': 'Expediente no encontrado.',
  },
  'matters.noAccess': {
    'es-ES': 'No tienes acceso a este expediente.',
    'es-DO': 'No tienes acceso a este expediente.',
  },
  'matters.clientNotInFirm': {
    'es-ES': 'El cliente no existe en este despacho.',
    'es-DO': 'El cliente no existe en este despacho.',
  },
  'matters.invalidLawyer': {
    'es-ES': 'El abogado no es válido para este despacho.',
    'es-DO': 'El abogado no es válido para este despacho.',
  },
  'matters.assignLawyerAdminOnly': {
    'es-ES': 'Solo el administrador del despacho puede asignar el letrado.',
    'es-DO': 'Solo el administrador del despacho puede asignar el abogado.',
  },
  'matters.referenceExists': {
    'es-ES': 'Ya existe un expediente con esa referencia.',
    'es-DO': 'Ya existe un expediente con esa referencia.',
  },
  'matters.invalidTransition': {
    'es-ES': 'Transición de estado no permitida: {from} → {to}.',
    'es-DO': 'Transición de estado no permitida: {from} → {to}.',
  },

  // ── Documentos ────────────────────────────────────────────────────────────
  'documents.fileMissing': {
    'es-ES': 'Falta el archivo.',
    'es-DO': 'Falta el archivo.',
  },
  'documents.notFound': {
    'es-ES': 'Documento no encontrado.',
    'es-DO': 'Documento no encontrado.',
  },
  'documents.versionNotFound': {
    'es-ES': 'Versión no encontrada.',
    'es-DO': 'Versión no encontrada.',
  },
  'documents.invalidReviewStatus': {
    'es-ES': 'PENDING no es un estado de revisión válido.',
    'es-DO': 'PENDING no es un estado de revisión válido.',
  },
  'documents.reviewForbidden': {
    'es-ES': 'Solo abogados o administradores pueden revisar documentos.',
    'es-DO': 'Solo abogados o administradores pueden revisar documentos.',
  },

  // ── Suscripción (SaaS de plataforma) ──────────────────────────────────────
  'subscription.required': {
    'es-ES': 'Tu prueba ha finalizado. Suscríbete para seguir usando Lawzora.',
    'es-DO': 'Tu prueba ha finalizado. Suscríbete para seguir usando Lawzora.',
  },
  'subscription.stripeNotConfigured': {
    'es-ES': 'El cobro por suscripción no está configurado.',
    'es-DO': 'El cobro por suscripción no está configurado.',
  },
  'subscription.checkoutFailed': {
    'es-ES': 'No se pudo iniciar el pago de la suscripción.',
    'es-DO': 'No se pudo iniciar el pago de la suscripción.',
  },
  'subscription.annualNotConfigured': {
    'es-ES': 'El pago anual no está configurado todavía.',
    'es-DO': 'El pago anual no está configurado todavía.',
  },
  'subscription.noCustomer': {
    'es-ES': 'El despacho aún no tiene una suscripción que gestionar.',
    'es-DO': 'El despacho aún no tiene una suscripción que gestionar.',
  },
  'subscription.webhookInvalid': {
    'es-ES': 'Webhook de suscripción inválido (firma no verificada).',
    'es-DO': 'Webhook de suscripción inválido (firma no verificada).',
  },

  // ── Plataforma (super-admin) ──────────────────────────────────────────────
  'platform.notConfigured': {
    'es-ES': 'La consola de plataforma no está configurada (faltan credenciales).',
    'es-DO': 'La consola de plataforma no está configurada (faltan credenciales).',
  },
  'platform.tenantNotFound': {
    'es-ES': 'Despacho no encontrado.',
    'es-DO': 'Despacho no encontrado.',
  },

  // ── Firma electrónica (Signaturit) ────────────────────────────────────────
  'signatures.notFound': {
    'es-ES': 'Solicitud de firma no encontrada.',
    'es-DO': 'Solicitud de firma no encontrada.',
  },
  'signatures.notCancelable': {
    'es-ES': 'La solicitud de firma no se puede cancelar en su estado actual.',
    'es-DO': 'La solicitud de firma no se puede cancelar en su estado actual.',
  },
  'signatures.webhookInvalid': {
    'es-ES': 'Webhook de firma inválido (firma no verificada).',
    'es-DO': 'Webhook de firma inválido (firma no verificada).',
  },

  // ── Plantillas de documento ───────────────────────────────────────────────
  'templates.notFound': {
    'es-ES': 'Plantilla no encontrada.',
    'es-DO': 'Plantilla no encontrada.',
  },

  // ── Ledger / Facturación ──────────────────────────────────────────────────
  'ledger.manualTypeNotAllowed': {
    'es-ES': 'Tipo de apunte no permitido manualmente.',
    'es-DO': 'Tipo de apunte no permitido manualmente.',
  },
  'ledger.amountPositiveForType': {
    'es-ES': 'El importe debe ser positivo para este tipo de apunte.',
    'es-DO': 'El importe debe ser positivo para este tipo de apunte.',
  },
  'ledger.amountPositive': {
    'es-ES': 'El importe debe ser positivo.',
    'es-DO': 'El importe debe ser positivo.',
  },
  'ledger.rateRequired': {
    'es-ES': 'Indica una tarifa o configura la tarifa de facturación del letrado en Ajustes.',
    'es-DO': 'Indica una tarifa o configura la tarifa de facturación del letrado en Ajustes.',
  },
  'ledger.firmNoTaxId': {
    'es-ES': 'El despacho no tiene identificador fiscal configurado; no se puede facturar.',
    'es-DO': 'El despacho no tiene identificador fiscal configurado; no se puede facturar.',
  },
  'ledger.invoiceNotFound': {
    'es-ES': 'Factura no encontrada.',
    'es-DO': 'Factura no encontrada.',
  },
  'ledger.entryNotFound': {
    'es-ES': 'Apunte no encontrado.',
    'es-DO': 'Apunte no encontrado.',
  },
  'ledger.costAlreadyResolved': {
    'es-ES': 'Este coste ya fue resuelto.',
    'es-DO': 'Este coste ya fue resuelto.',
  },

  // ── Cobros (Payment) ──────────────────────────────────────────────────────
  'payments.invoiceNotFound': {
    'es-ES': 'Factura no encontrada.',
    'es-DO': 'Factura no encontrada.',
  },
  'payments.amountPositive': {
    'es-ES': 'El importe del cobro debe ser positivo.',
    'es-DO': 'El importe del cobro debe ser positivo.',
  },
  'payments.alreadyPaid': {
    'es-ES': 'La factura ya está cobrada por completo.',
    'es-DO': 'La factura ya está cobrada por completo.',
  },
  'payments.amountExceedsOutstanding': {
    'es-ES': 'El importe del cobro supera el saldo pendiente de la factura.',
    'es-DO': 'El importe del cobro supera el saldo pendiente de la factura.',
  },
  'payments.invoiceNotPayable': {
    'es-ES': 'La factura no admite cobros en su estado actual.',
    'es-DO': 'La factura no admite cobros en su estado actual.',
  },
  'payments.onlineNotConfigured': {
    'es-ES': 'El cobro online no está configurado para esta jurisdicción.',
    'es-DO': 'El cobro online no está configurado para esta jurisdicción.',
  },
  'payments.stripeNotConnected': {
    'es-ES': 'El despacho aún no ha conectado su cuenta de Stripe.',
    'es-DO': 'El despacho aún no ha conectado su cuenta de Stripe.',
  },
  'payments.webhookInvalid': {
    'es-ES': 'Webhook inválido.',
    'es-DO': 'Webhook inválido.',
  },
  'payments.currencyMismatch': {
    'es-ES': 'La moneda del cobro no coincide con la de la factura.',
    'es-DO': 'La moneda del cobro no coincide con la de la factura.',
  },

  // ── Provisión de fondos / retainer ────────────────────────────────────────
  'retainer.amountPositive': {
    'es-ES': 'El importe de la provisión debe ser positivo.',
    'es-DO': 'El importe de la provisión debe ser positivo.',
  },
  'retainer.currencyMismatch': {
    'es-ES': 'La moneda de la provisión no coincide con la del despacho.',
    'es-DO': 'La moneda de la provisión no coincide con la del despacho.',
  },
  'retainer.anticipoRequiresInvoice': {
    'es-ES':
      'Un anticipo de honorarios devenga IVA al cobro y exige emitir factura de anticipo; ese flujo aún no está disponible (PR-R2b).',
    'es-DO':
      'Un anticipo de honorarios devenga ITBIS al emitir el e-CF y exige emitir factura de anticipo; ese flujo aún no está disponible (PR-R2b).',
  },
  'retainer.insufficientBalance': {
    'es-ES': 'Saldo de provisión insuficiente para esta operación.',
    'es-DO': 'Saldo de provisión insuficiente para esta operación.',
  },
  'retainer.anticipoApplyBlocked': {
    'es-ES':
      'El saldo de anticipo (ya facturado con IVA) no se aplica como cobro: se realiza emitiendo la factura final con deducción del anticipo (factura final). Aquí solo se aplican fondos de suplido o genéricos.',
    'es-DO':
      'El saldo de anticipo (ya facturado con ITBIS) no se aplica como cobro: se realiza emitiendo la factura final con deducción del anticipo (factura final). Aquí solo se aplican fondos de suplido o genéricos.',
  },
  'retainer.noAnticipoToDeduct': {
    'es-ES':
      'El expediente no tiene anticipos que deducir. Para una factura sin deducción usa la facturación normal.',
    'es-DO':
      'El expediente no tiene anticipos que deducir. Para una factura sin deducción usa la facturación normal.',
  },
  'retainer.anticipoAlreadyDeducted': {
    'es-ES': 'Los anticipos de este expediente ya se dedujeron en una factura final.',
    'es-DO': 'Los anticipos de este expediente ya se dedujeron en una factura final.',
  },
  'retainer.deductionExceedsService': {
    'es-ES':
      'Los anticipos superan el importe del servicio facturado; una devolución requiere factura rectificativa, no deducción.',
    'es-DO':
      'Los anticipos superan el importe del servicio facturado; una devolución requiere nota de crédito (e-CF), no deducción.',
  },
  'retainer.notAnAnticipoInvoice': {
    'es-ES': 'La factura indicada no es un anticipo de este expediente.',
    'es-DO': 'La factura indicada no es un anticipo de este expediente.',
  },
  'retainer.anticipoAlreadyRefunded': {
    'es-ES': 'Este anticipo ya fue devuelto con una factura rectificativa.',
    'es-DO': 'Este anticipo ya fue devuelto con una nota de crédito.',
  },
  'retainer.invoiceNotInMatter': {
    'es-ES': 'La factura no pertenece al expediente de esta provisión.',
    'es-DO': 'La factura no pertenece al expediente de esta provisión.',
  },

  // ── Facturación programada (recurrente / planes de pago) ──────────────────
  'billing.amountPositive': {
    'es-ES': 'El importe del plan (suma de las líneas) debe ser positivo.',
    'es-DO': 'El monto del plan (suma de las líneas) debe ser positivo.',
  },
  'billing.recurringNoInstallmentCount': {
    'es-ES': 'Un plan recurrente no lleva número de cuotas; usa periodos (occurrences).',
    'es-DO': 'Un plan recurrente no lleva número de cuotas; usa periodos (occurrences).',
  },
  'billing.installmentCountRequired': {
    'es-ES': 'Un plan de pago requiere un número de cuotas de al menos 2.',
    'es-DO': 'Un plan de pago requiere un número de cuotas de al menos 2.',
  },
  'billing.scheduleNotFound': {
    'es-ES': 'Plan de facturación no encontrado.',
    'es-DO': 'Plan de facturación no encontrado.',
  },
  'billing.scheduleNotActive': {
    'es-ES': 'El plan de facturación no está activo.',
    'es-DO': 'El plan de facturación no está activo.',
  },
  'billing.installmentsRunNotYet': {
    'es-ES': 'La emisión de planes de pago aún no está disponible (PR-RP4).',
    'es-DO': 'La emisión de planes de pago aún no está disponible (PR-RP4).',
  },
  'billing.advanceRunNotYet': {
    'es-ES':
      'La emisión de un plan de pago por anticipos se hace al cobrar cada cuota (POST /billing/installments/:id/collect).',
    'es-DO':
      'La emisión de un plan de pago por anticipos se hace al cobrar cada cuota (POST /billing/installments/:id/collect).',
  },
  'billing.installmentNotFound': {
    'es-ES': 'Cuota de facturación no encontrada.',
    'es-DO': 'Cuota de facturación no encontrada.',
  },
  'billing.installmentNotAdvance': {
    'es-ES': 'Esta cuota no pertenece a un plan de pago por anticipos.',
    'es-DO': 'Esta cuota no pertenece a un plan de pago por anticipos.',
  },
  'billing.installmentNotScheduled': {
    'es-ES': 'La cuota ya fue cobrada o no está pendiente.',
    'es-DO': 'La cuota ya fue cobrada o no está pendiente.',
  },

  // ── Tareas ────────────────────────────────────────────────────────────────
  'tasks.assigneeNotInFirm': {
    'es-ES': 'El usuario asignado no pertenece al despacho.',
    'es-DO': 'El usuario asignado no pertenece al despacho.',
  },
  'tasks.notFound': {
    'es-ES': 'Tarea no encontrada.',
    'es-DO': 'Tarea no encontrada.',
  },

  // ── Portal del cliente ────────────────────────────────────────────────────
  'portal.noClientProfile': {
    'es-ES': 'No tienes una ficha de cliente asociada.',
    'es-DO': 'No tienes una ficha de cliente asociada.',
  },

  // ── Ajustes del despacho ──────────────────────────────────────────────────
  'settings.taxIdInvalid': {
    'es-ES': 'Identificador fiscal del despacho no válido para la jurisdicción.',
    'es-DO': 'Identificador fiscal del despacho no válido para la jurisdicción.',
  },
  'settings.holidayExists': {
    'es-ES': 'Ya existe un festivo en esa fecha.',
    'es-DO': 'Ya existe un festivo en esa fecha.',
  },
  'settings.certificateMissing': {
    'es-ES': 'Falta el archivo del certificado.',
    'es-DO': 'Falta el archivo del certificado.',
  },

  // ── Usuarios del despacho (licencia/plazas) ───────────────────────────────
  'users.emailExists': {
    'es-ES': 'Ya existe un usuario con ese email en el despacho.',
    'es-DO': 'Ya existe un usuario con ese email en el despacho.',
  },
  'users.notFound': {
    'es-ES': 'Usuario no encontrado.',
    'es-DO': 'Usuario no encontrado.',
  },
  'users.notStaff': {
    'es-ES': 'Este usuario no es del despacho (es un usuario de portal).',
    'es-DO': 'Este usuario no es del despacho (es un usuario de portal).',
  },
  'users.lastAdmin': {
    'es-ES': 'No puedes dejar el despacho sin un administrador activo. Asigna otro admin primero.',
    'es-DO': 'No puedes dejar el despacho sin un administrador activo. Asigna otro admin primero.',
  },
  'users.licenseLimitReached': {
    'es-ES': 'Límite de licencia alcanzado: {max} {role}. Amplía el plan o desactiva un usuario.',
    'es-DO': 'Límite de licencia alcanzado: {max} {role}. Amplía el plan o desactiva un usuario.',
  },
} as const;

export type ApiMessageKey = keyof typeof API_MESSAGES;

/**
 * Construye el cuerpo de un error de la API con su `messageKey` traducible. Por defecto resuelve el
 * `message` fallback en es-ES desde el catálogo; el caller puede sobreescribirlo (mensajes interpolados)
 * y adjuntar `params`/`code` extra.
 */
export function apiError(
  messageKey: ApiMessageKey,
  extra: { message?: string; params?: Record<string, unknown>; code?: string } = {},
): { messageKey: ApiMessageKey; message: string; params?: Record<string, unknown>; code?: string } {
  const { message, ...rest } = extra;
  return {
    messageKey,
    message: message ?? API_MESSAGES[messageKey][DEFAULT_LOCALE],
    ...rest,
  };
}
