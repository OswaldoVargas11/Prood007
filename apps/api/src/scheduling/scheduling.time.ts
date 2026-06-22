/**
 * Utilidades de tiempo para la auto-agenda. Trabajamos en HORA LOCAL del despacho codificada en los
 * campos UTC de un Date (el instante guardado no se convierte de zona). Así, generar y mostrar franjas
 * es consistente y libre de bugs de DST: siempre leemos/formateamos con timeZone 'UTC'. El "ahora" local
 * sí se calcula con la zona real del despacho (vía Intl) para descartar correctamente las franjas pasadas.
 */

/** Zona horaria del despacho derivada de la jurisdicción (no hay campo tz en Tenant). */
export function firmTimeZone(jurisdiction: string): string {
  return jurisdiction === 'do' ? 'America/Santo_Domingo' : 'Europe/Madrid';
}

/** "Ahora" en hora local del despacho, codificado en campos UTC (DST-correcto). */
export function nowLocal(tz: string, ref: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(ref);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour = get('hour') % 24; // Intl puede devolver 24 a medianoche
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')),
  );
}

/** Día ISO (1=lunes … 7=domingo) de un instante codificado en UTC-local. */
export function isoWeekday(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

export type SchedulingRules = {
  weekdays: number[];
  startMin: number;
  endMin: number;
  slotMinutes: number;
};

/**
 * Genera las franjas libres en hora local del despacho para los próximos `days` días, a partir de las
 * reglas del abogado, descartando pasadas y las que solapan con citas existentes.
 */
export function generateSlots(
  rules: SchedulingRules,
  existing: { startsAt: Date; endsAt: Date }[],
  now: Date,
  days: number,
): Date[] {
  const out: Date[] = [];
  if (!rules.weekdays?.length || rules.slotMinutes <= 0 || rules.endMin <= rules.startMin)
    return out;
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let d = 0; d < days; d++) {
    const base = new Date(dayStart.getTime() + d * 86_400_000);
    if (!rules.weekdays.includes(isoWeekday(base))) continue;
    for (
      let min = rules.startMin;
      min + rules.slotMinutes <= rules.endMin;
      min += rules.slotMinutes
    ) {
      const s = new Date(base.getTime() + min * 60_000);
      if (s.getTime() <= now.getTime()) continue;
      const e = new Date(s.getTime() + rules.slotMinutes * 60_000);
      const collides = existing.some((a) => s < a.endsAt && a.startsAt < e);
      if (!collides) out.push(s);
    }
  }
  return out;
}

/** Etiquetas de día y hora ya formateadas en la zona del despacho (el cliente solo las muestra). */
export function slotLabels(d: Date, locale = 'es'): { dayLabel: string; timeLabel: string } {
  const dayLabel = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return { dayLabel, timeLabel };
}
