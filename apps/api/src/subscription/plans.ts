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

/** Ciclo de facturación de la suscripción. */
export type BillingCycle = 'MONTHLY' | 'ANNUAL';

/** Meses gratis al pagar ANUAL: pagas 10, usas 12 (≈17% de descuento). */
export const ANNUAL_FREE_MONTHS = 2;
export const MONTHS_PER_YEAR = 12;

/** Cupo del Plan Fundador: primeros N despachos (precio por plaza bloqueado de por vida). */
export const FOUNDER_CAP = 25;

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

/** Precio €/plaza para un nº de plazas dado, según unos tramos (tarifa de volumen: todas al tramo). */
export function pricePerSeatFromTiers(tiers: SeatTier[], seats: number): number {
  for (const t of tiers) {
    if (t.upTo === null || seats <= t.upTo) return t.pricePerSeatEur;
  }
  return tiers[tiers.length - 1]!.pricePerSeatEur;
}

/**
 * Tramos APLICABLES a un despacho: si es Fundador con tarifa bloqueada usa su snapshot; si no, la
 * tarifa pública vigente. Así el precio del fundador queda congelado aunque suba el precio público.
 */
export function effectiveTiers(t?: { isFounder?: boolean; lockedSeatTiers?: unknown }): SeatTier[] {
  if (t?.isFounder && Array.isArray(t.lockedSeatTiers) && t.lockedSeatTiers.length > 0) {
    return t.lockedSeatTiers as SeatTier[];
  }
  return SEAT_TIERS;
}

/** Precio €/plaza para un nº de plazas dado (tarifa de volumen pública). */
export function pricePerSeatEur(seats: number): number {
  return pricePerSeatFromTiers(SEAT_TIERS, seats);
}

/** Total mensual (EUR) para un nº de plazas, según unos tramos. */
export function monthlyTotalFromTiers(tiers: SeatTier[], seats: number): number {
  const n = Math.max(0, seats);
  return n * pricePerSeatFromTiers(tiers, n);
}

/** Total mensual (EUR) para un nº de plazas (tarifa pública). */
export function monthlyTotalEur(seats: number): number {
  return monthlyTotalFromTiers(SEAT_TIERS, seats);
}

/** Total ANUAL (EUR) = mensual × (12 − meses gratis). Pagas 10 meses, usas 12. */
export function annualTotalFromTiers(tiers: SeatTier[], seats: number): number {
  return monthlyTotalFromTiers(tiers, seats) * (MONTHS_PER_YEAR - ANNUAL_FREE_MONTHS);
}

/** Total a cobrar (EUR) según ciclo, para un nº de plazas y unos tramos. */
export function cycleTotalEur(cycle: BillingCycle, tiers: SeatTier[], seats: number): number {
  return cycle === 'ANNUAL'
    ? annualTotalFromTiers(tiers, seats)
    : monthlyTotalFromTiers(tiers, seats);
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
    // Sin fecha de fin de prueba (tenant creado directamente, p. ej. en tests) → no bloquear.
    return t.trialEndsAt == null || t.trialEndsAt.getTime() > now.getTime();
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
