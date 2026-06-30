/**
 * Lógica de dominio PURA del avisador de plazos del calendario de operación (T-3): selección de la
 * ventana de aviso de un hito y decisión de idempotencia. Sin Prisma ni I/O para poder testear los
 * límites de ventana sin BD.
 *
 * Trabaja en días naturales (las fechas objetivo de los hitos NO son plazos procesales): la fecha
 * objetivo y "hoy" se comparan a medianoche UTC, igual que el avisador de plazos de tareas.
 */

import { DealMilestoneKind, DealMilestoneStatus } from '@legalflow/domain';

/** Ventanas de antelación (días) para hitos NO prioritarios. De la más urgente a la más holgada. */
export const DEFAULT_MILESTONE_WINDOWS = [1, 7, 14] as const;

/**
 * Ventanas para hitos CRÍTICOS (longstop / plazo de condiciones): se avisa con más antelación y con
 * más hitos intermedios, porque su incumplimiento tiene consecuencias contractuales.
 */
export const PRIORITY_MILESTONE_WINDOWS = [1, 3, 7, 14, 30] as const;

/** Hitos cuyo incumplimiento tiene consecuencia contractual → tratamiento prioritario. */
export const PRIORITY_MILESTONE_KINDS: readonly DealMilestoneKind[] = [
  DealMilestoneKind.LONGSTOP,
  DealMilestoneKind.CONDITIONS_DEADLINE,
];

/** Estados de hito que ya NO requieren aviso (cumplido). MISSED sigue avisando hasta que se cierre. */
export const CLOSED_MILESTONE_STATUSES: readonly DealMilestoneStatus[] = [DealMilestoneStatus.DONE];

export function isPriorityMilestoneKind(kind: DealMilestoneKind): boolean {
  return PRIORITY_MILESTONE_KINDS.includes(kind);
}

export function windowsForMilestoneKind(kind: DealMilestoneKind): readonly number[] {
  return isPriorityMilestoneKind(kind) ? PRIORITY_MILESTONE_WINDOWS : DEFAULT_MILESTONE_WINDOWS;
}

/** Cota superior de la query: ningún hito más allá de la ventana más amplia posible entra al barrido. */
export const WIDEST_MILESTONE_WINDOW = Math.max(...PRIORITY_MILESTONE_WINDOWS);

/** Días naturales hasta la fecha objetivo (negativo si ya venció). `today` debe ser medianoche UTC. */
export function daysUntil(targetDate: Date, today: Date): number {
  return Math.floor((targetDate.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Ventana de aviso aplicable a un hito, o `null` si su fecha aún está fuera de la ventana más amplia de
 * su tipo. Se elige la ventana MÁS URGENTE (menor) cuyo umbral ya se alcanzó; las fechas YA vencidas
 * (días negativos) caen en la ventana más urgente. Al estrechar la ventana (acercarse la fecha) el
 * valor devuelto baja, lo que permite reavisar (ver `shouldRemind`).
 */
export function milestoneReminderWindow(
  targetDate: Date,
  kind: DealMilestoneKind,
  today: Date,
): number | null {
  const windows = [...windowsForMilestoneKind(kind)].sort((a, b) => a - b);
  const days = daysUntil(targetDate, today);
  const window = windows.find((w) => days <= w);
  return window ?? null;
}

/**
 * Idempotencia por (fecha objetivo, ventana): no repite una ventana ya avisada ni una más holgada del
 * mismo plazo. Reavisa si la fecha objetivo cambió o si entró una ventana más urgente que la última.
 */
export function shouldRemind(params: {
  window: number;
  targetDate: Date;
  lastRemindedForTargetDate: Date | null;
  lastReminderWindow: number | null;
}): boolean {
  const { window, targetDate, lastRemindedForTargetDate, lastReminderWindow } = params;
  const sameTargetDate =
    lastRemindedForTargetDate !== null &&
    lastRemindedForTargetDate.getTime() === targetDate.getTime();
  if (sameTargetDate && lastReminderWindow !== null && lastReminderWindow <= window) {
    return false;
  }
  return true;
}
