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
  'ledger.entry_added': 'añadió un apunte al ledger',
  'cost.proposed': 'propuso un coste',
  'cost.approved': 'aprobó un coste',
  'cost.rejected': 'rechazó un coste',
  'user.created': 'dio de alta a un usuario',
  'user.updated': 'actualizó un usuario',
  'tenant.updated': 'actualizó los datos del despacho',
};

export function activityLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ');
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
