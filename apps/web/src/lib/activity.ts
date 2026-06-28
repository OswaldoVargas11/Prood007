/**
 * Traduce las acciones del log de auditoría a frases legibles para el feed de actividad.
 * Ambos locales del producto son en español, así que el mapa es único (es). Fallback genérico.
 */
const ACTION_LABELS: Record<string, string> = {
  'client.created': 'creó un cliente',
  'client.updated': 'actualizó un cliente',
  'client.deleted': 'eliminó un cliente',
  'client.portal_user_created': 'dio acceso al portal a un cliente',
  'matter.created': 'creó un expediente',
  'matter.updated': 'actualizó un expediente',
  'matter.status_changed': 'cambió el estado de un expediente',
  'document.uploaded': 'subió un documento',
  'document.version_added': 'añadió una versión de documento',
  'document.reviewed': 'revisó un documento',
  'task.created': 'creó una tarea',
  'task.created_from_deadline': 'creó una tarea desde un plazo',
  'task.updated': 'actualizó una tarea',
  'task.deleted': 'eliminó una tarea',
  'time.logged': 'registró tiempo',
  'invoice.issued': 'emitió una factura',
  'invoice.paid': 'marcó una factura como pagada',
  'invoice.payment_recorded': 'registró un pago de factura',
  'ledger.entry_added': 'añadió un apunte al ledger',
  'cost.proposed': 'propuso un coste',
  'cost.approved': 'aprobó un coste',
  'cost.rejected': 'rechazó un coste',
  'user.created': 'dio de alta a un usuario',
  'user.updated': 'actualizó un usuario',
  'user.password_changed': 'cambió su contraseña',
  'tenant.updated': 'actualizó los datos del despacho',
  'auth.login_success': 'inició sesión',
  'auth.login_failed': 'intento de inicio de sesión fallido',
  'document.generated_from_template': 'generó un documento desde una plantilla',
  'dunning.reminder_sent': 'envió un recordatorio de cobro',
  'signature.requested': 'solicitó una firma',
  'signature.canceled': 'canceló una firma',
  'stripe.account_connected': 'conectó la cuenta de cobros',
  'template.created': 'creó una plantilla',
  'template.updated': 'actualizó una plantilla',
  'template.deleted': 'eliminó una plantilla',
};

export function activityLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ');
}

/** Tipos de entidad del log de auditoría → etiqueta legible en español (el modelo está en inglés). */
const ENTITY_LABELS: Record<string, string> = {
  Client: 'Cliente',
  Document: 'Documento',
  DocumentTemplate: 'Plantilla',
  DocumentVersion: 'Versión de documento',
  DunningReminder: 'Recordatorio',
  Invoice: 'Factura',
  LedgerEntry: 'Apunte',
  Matter: 'Expediente',
  Payment: 'Pago',
  SignatureRequest: 'Solicitud de firma',
  Task: 'Tarea',
  Tenant: 'Despacho',
  TimeEntry: 'Registro de tiempo',
  User: 'Usuario',
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/** Color semántico del punto del timeline según el tipo de acción. */
export function activityColor(action: string): string {
  if (action.startsWith('invoice')) return 'var(--success)';
  if (action.startsWith('document')) return 'var(--violet)';
  if (action.startsWith('task') || action.startsWith('time')) return 'var(--info)';
  if (action.startsWith('matter')) return 'var(--brand)';
  return 'var(--text-subtle)';
}

/** Tiempo relativo compacto en español (hace X). */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return `hace ${Math.round(d / 7)} sem`;
}
