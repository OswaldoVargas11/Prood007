/**
 * Suscripción de PLATAFORMA (el despacho paga a Lawzora). Distinto del módulo `billing` (cobro del
 * despacho a SUS clientes). El CATÁLOGO DE PRECIOS canónico vive en `@legalflow/domain` (pricing.ts);
 * aquí quedan los helpers de ACCESO/PRUEBA y un par de utilidades de plan para el backend.
 *
 * Modelo NUEVO (altas nuevas): 3 tiers (Esencial/Profesional/Avanzado) × 3 ciclos (Mensual/Anual/
 * Bienal) + Fundador. SIN descuento por volumen. Las suscripciones EXISTENTES no se reprecian
 * (grandfathering): siguen en su Price de Stripe; el catálogo nuevo no las toca.
 */

import {
  FOUNDER,
  PLAN_TIERS,
  TRIAL_DAYS as CATALOG_TRIAL_DAYS,
  monthlyEurForTier,
  type PlanCycle,
  type SubscriptionTierId,
} from '@legalflow/domain';

export const TRIAL_DAYS = CATALOG_TRIAL_DAYS;

/** Ciclo de facturación (ahora incluye BIENNIAL). Alias del tipo del catálogo. */
export type BillingCycle = PlanCycle;

/** Cupo del Plan Fundador (contador real; cierra al llenarse). */
export const FOUNDER_CAP = FOUNDER.cap;

/** Plazas disponibles durante la PRUEBA (generoso para evaluar en equipo, pero acotado). */
export const TRIAL_MAX_ADMINS = 5;
export const TRIAL_MAX_LAWYERS = 25;

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED';

const TIER_IDS = PLAN_TIERS.map((t) => t.id);

/** Resuelve el `plan` guardado del tenant a un tier conocido (fallback Profesional). */
export function resolveTier(plan?: string | null): SubscriptionTierId {
  return plan && (TIER_IDS as string[]).includes(plan)
    ? (plan as SubscriptionTierId)
    : 'PROFESIONAL';
}

/** ¿El `plan` guardado es el Plan Fundador? */
export function isFounderPlan(plan?: string | null): boolean {
  return plan === 'FOUNDER';
}

/** €/plaza/mes lista del plan del tenant (Fundador → tarifa fundador; tier → su precio lista). */
export function planMonthlyEur(plan?: string | null): number {
  return isFounderPlan(plan) ? FOUNDER.monthlyEur : monthlyEurForTier(resolveTier(plan));
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
