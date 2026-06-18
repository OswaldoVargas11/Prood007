/**
 * Crea (idempotente) el producto + precio de SUSCRIPCIÓN de plataforma en Stripe: una plaza de staff,
 * mensual, con precios ESCALONADOS POR VOLUMEN (todas las plazas al tramo según el total):
 *   1-5 → €39 · 6-15 → €35 · 16+ → €29.
 * La cantidad de la suscripción = nº de plazas. Imprime el PRICE ID para `STRIPE_PRICE_SEAT`.
 *
 * Uso: STRIPE_SECRET_KEY=sk_test_... node apps/api/scripts/setup-stripe-billing.mjs
 */
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Falta STRIPE_SECRET_KEY');
  process.exit(1);
}
const stripe = new Stripe(key);
const LOOKUP_KEY = 'lawzora_seat_monthly';

const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
if (existing.data.length > 0) {
  console.log('PRICE_ID', existing.data[0].id, '(ya existía)');
  process.exit(0);
}

const product = await stripe.products.create({
  name: 'Lawzora — Plaza de staff',
  description: 'Suscripción mensual por plaza (letrado/admin). Producto completo, sin límites de funciones.',
});

const price = await stripe.prices.create({
  product: product.id,
  currency: 'eur',
  lookup_key: LOOKUP_KEY,
  recurring: { interval: 'month' },
  billing_scheme: 'tiered',
  tiers_mode: 'volume',
  tiers: [
    { up_to: 5, unit_amount: 3900 },
    { up_to: 15, unit_amount: 3500 },
    { up_to: 'inf', unit_amount: 2900 },
  ],
});

console.log('PRICE_ID', price.id);
