/**
 * Cálculo de plazos en días hábiles con festivos. Agnóstico de país: cada provider aporta su
 * función `isHoliday`. El cómputo empieza el día siguiente a la fecha de inicio (la notificación
 * no cuenta) y avanza saltando fines de semana y festivos.
 */

export type HolidayChecker = (date: Date) => boolean;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // domingo o sábado
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface BusinessDaysResult {
  dueDate: string;
  holidaysApplied: string[];
}

/**
 * Suma `days` días hábiles a `start` (exclusive), saltando fines de semana y festivos.
 * Devuelve la fecha límite (ISO yyyy-mm-dd) y los festivos (no findes) atravesados.
 */
export function addBusinessDays(
  start: Date,
  days: number,
  isHoliday: HolidayChecker,
): BusinessDaysResult {
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const holidaysApplied: string[] = [];
  let counted = 0;

  while (counted < days) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWeekend(cursor)) continue;
    if (isHoliday(cursor)) {
      holidaysApplied.push(toIsoDate(cursor));
      continue;
    }
    counted += 1;
  }

  return { dueDate: toIsoDate(cursor), holidaysApplied };
}

/** Domingo de Pascua para un año (algoritmo de Meeus/Jones/Butcher), en UTC. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Festivos nacionales de España para un año (fijos + Viernes Santo, movible). */
export function spanishNationalHolidays(year: number): Set<string> {
  const fixed: Array<[number, number]> = [
    [1, 1], // Año Nuevo
    [1, 6], // Epifanía
    [5, 1], // Día del Trabajo
    [8, 15], // Asunción
    [10, 12], // Fiesta Nacional
    [11, 1], // Todos los Santos
    [12, 6], // Constitución
    [12, 8], // Inmaculada
    [12, 25], // Navidad
  ];
  const set = new Set<string>(
    fixed.map(([m, d]) => new Date(Date.UTC(year, m - 1, d)).toISOString().slice(0, 10)),
  );
  // Viernes Santo = Pascua − 2 días.
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(easter.getUTCDate() - 2);
  set.add(goodFriday.toISOString().slice(0, 10));
  return set;
}
