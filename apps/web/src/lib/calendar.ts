/**
 * Utilidades de calendario para la agenda de plazos (Tanda A.3). Semana empezando en lunes (ES/DO).
 * Sin dependencias externas: construimos la rejilla del mes a mano.
 */

export interface DayCell {
  /** Fecha del día (medianoche local). */
  date: Date;
  /** Día del mes (1-31). */
  day: number;
  /** Si pertenece al mes mostrado (false = relleno de mes adyacente). */
  inMonth: boolean;
  /** Clave ISO local `YYYY-MM-DD` para agrupar por día. */
  key: string;
  isToday: boolean;
  isWeekend: boolean;
}

/** Clave de día natural local (no UTC) para agrupar deadlines por celda. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Índice lunes-first (0 = lunes … 6 = domingo). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Rejilla de 6 semanas (42 celdas) que cubre el mes `month` (0-11) del año `year`, con relleno de los
 * meses adyacentes para completar semanas lunes→domingo.
 */
export function buildMonthGrid(year: number, month: number, today = new Date()): DayCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - mondayIndex(first));
  const todayKey = dayKey(today);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const wd = date.getDay();
    cells.push({
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      key: dayKey(date),
      isToday: dayKey(date) === todayKey,
      isWeekend: wd === 0 || wd === 6,
    });
  }
  return cells;
}

export type DeadlineUrgency = 'overdue' | 'urgent' | 'soon' | 'later' | 'done';

/** Días naturales entre hoy y la fecha (negativo = pasado). */
export function daysUntil(iso: string, now = new Date()): number {
  const d = new Date(iso);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function deadlineUrgency(iso: string, isDone: boolean, now = new Date()): DeadlineUrgency {
  if (isDone) return 'done';
  const days = daysUntil(iso, now);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'soon';
  return 'later';
}

/** Color (token CSS) por urgencia, para barras y chips. */
export const URGENCY_COLOR: Record<DeadlineUrgency, string> = {
  overdue: 'var(--danger)',
  urgent: 'var(--warning)',
  soon: 'var(--brand)',
  later: 'var(--info)',
  done: 'var(--text-subtle)',
};
