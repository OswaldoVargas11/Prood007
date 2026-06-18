/**
 * Suscripción de PLATAFORMA (el despacho paga a Lawzora). Distinto del módulo `billing` (cobro del
 * despacho a SUS clientes). Modelo POR USUARIO confirmado por el owner: **producto completo, sin tiers
 * de funcionalidad**; se paga por plaza de staff (letrado/admin) con DESCUENTO POR VOLUMEN. Prueba de
 * 15 días con todo abierto.
 *
 * Precio por plaza (ES, EUR/mes; RD en USD ~-40%):
 *   1-5 plazas → €39 · 6-15 → €35 · 16+ → €29   (tarifa "volumen": TODAS las plazas al tramo aplicable).
 */

export const TRIAL_DAYS = 15;

/** Plazas disponibles durante la PRUEBA (generoso para evaluar en equipo, pero acotado). */
export const TRIAL_MAX_ADMINS = 5;
export const TRIAL_MAX_LAWYERS = 25;

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED';

/** Tramo de precio por plaza (volumen). `upTo` null = tramo superior abierto. */
export interface SeatTier {
  upTo: number | null;
  pricePerSeatEur: number;
}

export const SEAT_TIERS: SeatTier[] = [
  { upTo: 5, pricePerSeatEur: 39 },
  { upTo: 15, pricePerSeatEur: 35 },
  { upTo: null, pricePerSeatEur: 29 },
];

/** Precio €/plaza para un nº de plazas dado (tarifa de volumen: todas al tramo aplicable). */
export function pricePerSeatEur(seats: number): number {
  for (const t of SEAT_TIERS) {
    if (t.upTo === null || seats <= t.upTo) return t.pricePerSeatEur;
  }
  return SEAT_TIERS[SEAT_TIERS.length - 1]!.pricePerSeatEur;
}

/** Total mensual (EUR) para un nº de plazas. */
export function monthlyTotalEur(seats: number): number {
  return seats * pricePerSeatEur(Math.max(0, seats));
}

/**
 * ¿El despacho tiene acceso a la app? ACTIVE siempre; TRIALING solo si la prueba no ha caducado.
 * PAST_DUE / SUSPENDED / CANCELED → muro (sin acceso). El login NO se bloquea aquí.
 */
export function hasAppAccess(
  t: { subscriptionStatus: string; trialEndsAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (t.subscriptionStatus === 'ACTIVE') return true;
  if (t.subscriptionStatus === 'TRIALING') {
    return t.trialEndsAt != null && t.trialEndsAt.getTime() > now.getTime();
  }
  return false;
}

/** Días de prueba restantes (>=0); null si no está en prueba. */
export function trialDaysLeft(
  t: { subscriptionStatus: string; trialEndsAt: Date | null },
  now: Date = new Date(),
): number | null {
  if (t.subscriptionStatus !== 'TRIALING' || !t.trialEndsAt) return null;
  const ms = t.trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
