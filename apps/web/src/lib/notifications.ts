/**
 * Agrupación y clasificación de notificaciones para el centro de notificaciones (Tanda A.2).
 * Ambos locales del producto son español; las etiquetas de grupo se resuelven con i18n en la página.
 */
import type { Notification } from './types';

export type NotificationKind = 'document' | 'task' | 'message' | 'other';

/** Clasifica por el prefijo del `type` del backend (document.review, task.assigned, …). */
export function notificationKind(type: string): NotificationKind {
  if (type.startsWith('document')) return 'document';
  if (type.startsWith('task') || type.startsWith('time')) return 'task';
  if (type.startsWith('message') || type.startsWith('chat')) return 'message';
  return 'other';
}

export type NotificationBucket = 'today' | 'yesterday' | 'week' | 'earlier';

/** Bucket temporal relativo a hoy (por día natural, no por horas). */
export function notificationBucket(iso: string, now = new Date()): NotificationBucket {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'earlier';
}

export interface NotificationGroup {
  bucket: NotificationBucket;
  items: Notification[];
}

const ORDER: NotificationBucket[] = ['today', 'yesterday', 'week', 'earlier'];

/** Agrupa una lista (ya ordenada desc por createdAt) en buckets temporales, preservando el orden. */
export function groupNotifications(items: Notification[], now = new Date()): NotificationGroup[] {
  const byBucket = new Map<NotificationBucket, Notification[]>();
  for (const n of items) {
    const b = notificationBucket(n.createdAt, now);
    const list = byBucket.get(b) ?? [];
    list.push(n);
    byBucket.set(b, list);
  }
  return ORDER.filter((b) => byBucket.has(b)).map((bucket) => ({
    bucket,
    items: byBucket.get(bucket)!,
  }));
}
