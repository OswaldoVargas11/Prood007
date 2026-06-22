import type { ConfigService } from '@nestjs/config';
import {
  planPriceKey,
  type Currency,
  type PlanCycle,
  type SubscriptionTierId,
} from '@legalflow/domain';

/**
 * Mapa de Price IDs de Stripe (esquema NUEVO). NO se incrustan en el código: el owner ejecuta
 * `scripts/setup-stripe.ts`, que crea los Price y vuelca sus IDs; el owner los pega en la variable de
 * entorno `STRIPE_PRICE_MAP` (JSON `{ "PROFESIONAL:ANNUAL:EUR": "price_…", … }`). Aquí solo se leen.
 */
export type PlanKey = SubscriptionTierId | 'FOUNDER';

export function loadPriceMap(config: ConfigService): Record<string, string> {
  const raw = config.get<string>('STRIPE_PRICE_MAP');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function resolvePriceId(
  map: Record<string, string>,
  plan: PlanKey,
  cycle: PlanCycle,
  currency: Currency,
): string | undefined {
  return map[planPriceKey(plan, cycle, currency)];
}
