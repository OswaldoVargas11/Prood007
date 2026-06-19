/**
 * Crea (idempotente) el producto + precios de SUSCRIPCIÓN de plataforma en Stripe: una plaza de staff,
 * con precios ESCALONADOS POR VOLUMEN (todas las plazas al tramo según el total):
 *   1-5 → €39 · 6-15 → €35 · 16+ → €29.
 * Crea DOS precios sobre el mismo producto:
 *   - MENSUAL  (lookup_key lawzora_seat_monthly) → STRIPE_PRICE_SEAT
 *   - ANUAL    (lookup_key lawzora_seat_annual)  → STRIPE_PRICE_SEAT_ANNUAL  (2 meses gratis = mensual × 10)
 * La cantidad de la suscripción = nº de plazas. Imprime ambos PRICE ID.
 *
 * Uso (SIEMPRE con clave de TEST en desarrollo; la live sólo en producción desplegada):
 *   STRIPE_SECRET_KEY=sk_test_... node apps/api/scripts/setup-stripe-billing.mjs
 */
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Falta STRIPE_SECRET_KEY');
  process.exit(1);
}
const stripe = new Stripe(key);

const MONTHLY_KEY = 'lawzora_seat_monthly';
const ANNUAL_KEY = 'lawzora_seat_annual';
const FREE_MONTHS = 2; // anual = mensual × (12 − 2)

// Tramos mensuales en céntimos. El anual = mensual × 10 (2 meses gratis).
const MONTHLY_TIERS = [
  { up_to: 5, unit_amount: 3900 },
  { up_to: 15, unit_amount: 3500 },
  { up_to: 'inf', unit_amount: 2900 },
];
const ANNUAL_TIERS = MONTHLY_TIERS.map((t) => ({
  up_to: t.up_to,
  unit_amount: t.unit_amount * (12 - FREE_MONTHS),
}));

/** Crea (o reutiliza) un precio escalonado por volumen con un lookup_key dado. */
async function ensurePrice({ product, lookupKey, interval, tiers }) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data.length > 0) {
    console.log(`PRICE (${lookupKey})`, existing.data[0].id, '(ya existía)');
    return existing.data[0].id;
  }
  const price = await stripe.prices.create({
    product,
    currency: 'eur',
    lookup_key: lookupKey,
    recurring: { interval },
    billing_scheme: 'tiered',
    tiers_mode: 'volume',
    tiers,
  });
  console.log(`PRICE (${lookupKey})`, price.id);
  return price.id;
}

// Reutiliza el producto si ya hay un precio mensual; si no, lo crea.
const existingMonthly = await stripe.prices.list({ lookup_keys: [MONTHLY_KEY], active: true, limit: 1 });
let productId = existingMonthly.data[0]?.product;
if (!productId) {
  const product = await stripe.products.create({
    name: 'Lawzora — Plaza de staff',
    description: 'Suscripción por plaza (letrado/admin). Producto completo, sin límites de funciones.',
  });
  productId = product.id;
}

const monthly = await ensurePrice({
  product: productId,
  lookupKey: MONTHLY_KEY,
  interval: 'month',
  tiers: MONTHLY_TIERS,
});
const annual = await ensurePrice({
  product: productId,
  lookupKey: ANNUAL_KEY,
  interval: 'year',
  tiers: ANNUAL_TIERS,
});

console.log('\nConfigura las variables de entorno:');
console.log('  STRIPE_PRICE_SEAT       =', monthly);
console.log('  STRIPE_PRICE_SEAT_ANNUAL=', annual);
