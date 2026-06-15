/**
 * Agrupación y clasificación de notificaciones para el centro de notificaciones (Tanda A.2).
 * Ambos locales del producto son español; las etiquetas de grupo se resuelven con i18n en la página.
 */
import { useTranslations } from 'next-intl';
import type { Notification } from './types';

export type NotificationKind = 'document' | 'task' | 'message' | 'other';

/**
 * Estados de revisión documental que el backend incrusta crudos en el título de la notificación
 * (p. ej. `Documento "X" — APPROVED`). El resto de títulos ya van en español. Si en el futuro otro
 * `notifications.create` filtra un enum, se añade su código aquí (y su catálogo en el map de abajo).
 */
const ENUM_CODES = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] as const;

/**
 * Devuelve una función que sustituye los enums crudos de un texto de notificación por su etiqueta
 * traducida (palabra completa). Se aplica al título y al cuerpo en todos los puntos donde se pintan
 * notificaciones (centro de notificaciones y campana).
 */
export function useLocalizeNotificationText(): (text: string | null) => string {
  const tDocStatus = useTranslations('documents.status');
  return (text) => {
    if (!text) return '';
    return ENUM_CODES.reduce(
      (acc, code) => acc.replace(new RegExp(`\\b${code}\\b`, 'g'), tDocStatus(code)),
      text,
    );
  };
}

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
