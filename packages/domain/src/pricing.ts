/**
 * Catálogo de PRECIOS de la suscripción de plataforma (el despacho paga a Lawzora) — ÚNICA FUENTE DE
 * VERDAD. La landing, la app y el backend (y el script de Stripe) leen de aquí; cero precios duplicados.
 *
 * Modelo (confirmado 2026-06): 3 tiers por funcionalidad (Esencial/Profesional/Avanzado) × 3 ciclos
 * (Mensual/Anual/Bienal) × moneda (EUR canónico, USD por FX) + Plan Fundador (funciones Profesional,
 * tarifa congelada, solo prepago anual/bienal, cupo total con contador). SIN descuento por volumen.
 *
 * NB: estos importes son los del esquema NUEVO (altas nuevas). Las suscripciones EXISTENTES no se
 * reprecian (grandfathering): siguen en su precio de Stripe; este catálogo no las toca.
 */

import { Currency, Jurisdiction } from './enums';

/** Tiers de funcionalidad (el id es estable; los nombres visibles van por i18n). */
export type SubscriptionTierId = 'ESENCIAL' | 'PROFESIONAL' | 'AVANZADO';

/** Ciclo de facturación de la suscripción. */
export type PlanCycle = 'MONTHLY' | 'ANNUAL' | 'BIENNIAL';
export const PLAN_CYCLES: readonly PlanCycle[] = ['MONTHLY', 'ANNUAL', 'BIENNIAL'];

export interface PlanTierDef {
  id: SubscriptionTierId;
  /** Precio LISTA €/plaza/mes (EUR canónico). */
  monthlyEur: number;
  /** Tier ancla destacado en la UI ("más popular"). */
  popular?: boolean;
}

/** Precios lista €/plaza/mes (EUR). Fuente de verdad. */
export const PLAN_TIERS: readonly PlanTierDef[] = [
  { id: 'ESENCIAL', monthlyEur: 45 },
  { id: 'PROFESIONAL', monthlyEur: 69, popular: true },
  { id: 'AVANZADO', monthlyEur: 99 },
];

/**
 * Plan Fundador: funciones del tier Profesional, precio congelado de por vida, entrada SOLO con prepago
 * anual o bienal, cupo total con contador real que cierra al llenarse.
 */
export const FOUNDER = {
  monthlyEur: 39,
  baseTier: 'PROFESIONAL' as SubscriptionTierId,
  cap: 18,
  cycles: ['ANNUAL', 'BIENNIAL'] as readonly PlanCycle[],
} as const;

export const TRIAL_DAYS = 15;

/**
 * Definición de cada ciclo:
 * - `billedMonths`: nº de meses-precio que se cobran por periodo (lo que se factura = lista × billedMonths).
 * - `periodMonths`: duración del periodo (para el equivalente mensual y el % de ahorro).
 * - `stripeInterval`/`stripeIntervalCount`: cómo se modela en Stripe.
 *
 * MONTHLY: 1/1. ANNUAL: 2 meses gratis → 10/12 (ahorro 16,7%). BIENNIAL: −25% sobre 24m → 18/24.
 */
export interface PlanCycleDef {
  id: PlanCycle;
  billedMonths: number;
  periodMonths: number;
  stripeInterval: 'month' | 'year';
  stripeIntervalCount: number;
}

export const PLAN_CYCLE_DEFS: Record<PlanCycle, PlanCycleDef> = {
  MONTHLY: {
    id: 'MONTHLY',
    billedMonths: 1,
    periodMonths: 1,
    stripeInterval: 'month',
    stripeIntervalCount: 1,
  },
  ANNUAL: {
    id: 'ANNUAL',
    billedMonths: 10,
    periodMonths: 12,
    stripeInterval: 'year',
    stripeIntervalCount: 1,
  },
  BIENNIAL: {
    id: 'BIENNIAL',
    billedMonths: 18,
    periodMonths: 24,
    stripeInterval: 'year',
    stripeIntervalCount: 2,
  },
};

/** Tasas FX por defecto (EUR canónico). Configurables/override por entorno o por moneda. */
export type FxRates = Partial<Record<Currency, number>>;
export const DEFAULT_FX: Record<Currency, number> = {
  [Currency.EUR]: 1,
  [Currency.USD]: 1.08,
  [Currency.DOP]: 64,
};

/** Monedas que se generan en Stripe hoy (DOP queda preparado pero no se mina hasta pedirlo). */
export const PLAN_BILLING_CURRENCIES: readonly Currency[] = [Currency.EUR, Currency.USD];

/** Moneda de facturación del SaaS según jurisdicción: ES→EUR, RD→USD, resto→EUR (por defecto). */
export function planCurrencyForJurisdiction(j: Jurisdiction): Currency {
  return j === Jurisdiction.DO ? Currency.USD : Currency.EUR;
}

export function monthlyEurForTier(tier: SubscriptionTierId): number {
  return PLAN_TIERS.find((t) => t.id === tier)?.monthlyEur ?? 0;
}

/** EUR por plaza FACTURADO por periodo según ciclo (lista × billedMonths). */
export function perSeatPeriodEur(monthlyEur: number, cycle: PlanCycle): number {
  return monthlyEur * PLAN_CYCLE_DEFS[cycle].billedMonths;
}

/** Equivalente €/plaza/mes según ciclo (para mostrar "X €/mes equivalente"). */
export function effectiveMonthlyEur(monthlyEur: number, cycle: PlanCycle): number {
  const c = PLAN_CYCLE_DEFS[cycle];
  return (monthlyEur * c.billedMonths) / c.periodMonths;
}

/** Ahorro % frente al mensual lista (16.7 anual, 25 bienal, 0 mensual). */
export function savingsPct(cycle: PlanCycle): number {
  const c = PLAN_CYCLE_DEFS[cycle];
  return Math.round((1 - c.billedMonths / c.periodMonths) * 1000) / 10;
}

/** Convierte un importe EUR a la moneda destino con FX (redondeo a entero; lista sin decimales). */
export function convertEur(amountEur: number, currency: Currency, fx: FxRates = {}): number {
  const rate = fx[currency] ?? DEFAULT_FX[currency] ?? 1;
  return Math.round(amountEur * rate);
}

/** `unit_amount` de Stripe (minor units). EUR/USD/DOP tienen 2 decimales → ×100. */
export function toStripeMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

/** Clave estable de un Price (tier|FOUNDER × ciclo × moneda) para el mapa de IDs de Stripe. */
export function planPriceKey(
  plan: SubscriptionTierId | 'FOUNDER',
  cycle: PlanCycle,
  currency: Currency,
): string {
  return `${plan}:${cycle}:${currency}`;
}

/** Una fila del catálogo resuelto (un tier en un ciclo y moneda), lista para mostrar/cobrar. */
export interface PlanPriceRow {
  plan: SubscriptionTierId | 'FOUNDER';
  cycle: PlanCycle;
  currency: Currency;
  /** €/plaza/mes lista (en EUR, antes de FX) — referencia. */
  listMonthlyEur: number;
  /** Importe por plaza facturado por periodo, en la moneda destino. */
  perSeatPeriod: number;
  /** Equivalente por plaza/mes en la moneda destino. */
  perSeatMonthly: number;
  savingsPct: number;
  stripeInterval: 'month' | 'year';
  stripeIntervalCount: number;
}

/**
 * Catálogo COMPLETO resuelto (todas las combinaciones que se cobran): 3 tiers × 3 ciclos × monedas +
 * Fundador (anual/bienal). Es la lista que recorre tanto la UI como el script de Stripe.
 */
export function buildPlanCatalog(
  fx: FxRates = {},
  currencies: readonly Currency[] = PLAN_BILLING_CURRENCIES,
): PlanPriceRow[] {
  const rows: PlanPriceRow[] = [];
  const make = (
    plan: SubscriptionTierId | 'FOUNDER',
    monthlyEur: number,
    cycle: PlanCycle,
    currency: Currency,
  ): PlanPriceRow => {
    const def = PLAN_CYCLE_DEFS[cycle];
    return {
      plan,
      cycle,
      currency,
      listMonthlyEur: monthlyEur,
      perSeatPeriod: convertEur(perSeatPeriodEur(monthlyEur, cycle), currency, fx),
      perSeatMonthly: convertEur(effectiveMonthlyEur(monthlyEur, cycle), currency, fx),
      savingsPct: savingsPct(cycle),
      stripeInterval: def.stripeInterval,
      stripeIntervalCount: def.stripeIntervalCount,
    };
  };
  for (const currency of currencies) {
    for (const tier of PLAN_TIERS) {
      for (const cycle of PLAN_CYCLES) rows.push(make(tier.id, tier.monthlyEur, cycle, currency));
    }
    for (const cycle of FOUNDER.cycles)
      rows.push(make('FOUNDER', FOUNDER.monthlyEur, cycle, currency));
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entitlements: qué FUNCIONES desbloquea cada tier. Fuente de verdad para el guard
// del backend y el gating del front. Núcleo (Esencial) = todo lo que NO está aquí.
// ─────────────────────────────────────────────────────────────────────────────

/** Funciones con gating por tier (las del núcleo Esencial no se listan: siempre disponibles). */
export type Feature =
  | 'templates'
  | 'clauses'
  | 'document-packages'
  | 'signatures'
  | 'closing'
  | 'data-room'
  | 'engagement'
  | 'company-secretary'
  | 'ai'
  | 'integrations'
  | 'cloud-import'
  | 'addins'
  | 'semantic-search';

/** Tier mínimo que desbloquea cada función. */
export const FEATURE_MIN_TIER: Record<Feature, SubscriptionTierId> = {
  // Profesional+
  templates: 'PROFESIONAL',
  clauses: 'PROFESIONAL',
  'document-packages': 'PROFESIONAL',
  signatures: 'PROFESIONAL',
  closing: 'PROFESIONAL',
  'data-room': 'PROFESIONAL',
  engagement: 'PROFESIONAL',
  'company-secretary': 'PROFESIONAL',
  ai: 'PROFESIONAL',
  // Avanzado+
  integrations: 'AVANZADO',
  'cloud-import': 'AVANZADO',
  addins: 'AVANZADO',
  'semantic-search': 'AVANZADO',
};

export const ALL_FEATURES = Object.keys(FEATURE_MIN_TIER) as Feature[];

const TIER_RANK: Record<SubscriptionTierId, number> = {
  ESENCIAL: 1,
  PROFESIONAL: 2,
  AVANZADO: 3,
};

/**
 * Tier EFECTIVO para entitlements a partir del `plan` guardado del tenant:
 * - tier explícito (ESENCIAL/PROFESIONAL/AVANZADO) → ese tier.
 * - FOUNDER → funciones de Profesional.
 * - cualquier otro (legacy "Profesional", prueba, vacío) → 'FULL' (acceso completo, grandfathering).
 *   Solo las altas nuevas que eligen un tier concreto quedan gated.
 */
export function planEffectiveTier(plan?: string | null): SubscriptionTierId | 'FULL' {
  if (plan === 'ESENCIAL' || plan === 'PROFESIONAL' || plan === 'AVANZADO') return plan;
  if (plan === 'FOUNDER') return FOUNDER.baseTier;
  return 'FULL';
}

/** ¿El plan del tenant incluye la función? */
export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  const eff = planEffectiveTier(plan);
  if (eff === 'FULL') return true;
  return TIER_RANK[eff] >= TIER_RANK[FEATURE_MIN_TIER[feature]];
}

/** Mapa función→bool con el entitlement del plan (para exponerlo al front). */
export function featuresForPlan(plan?: string | null): Record<Feature, boolean> {
  const out = {} as Record<Feature, boolean>;
  for (const f of ALL_FEATURES) out[f] = planHasFeature(plan, f);
  return out;
}
