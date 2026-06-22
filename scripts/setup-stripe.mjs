#!/usr/bin/env node
/**
 * Configuración de Stripe COMO CÓDIGO para la suscripción de plataforma de Lawzora (el despacho paga a
 * Lawzora). Crea/actualiza los Products y Prices del esquema NUEVO leyendo del catálogo canónico
 * (`@legalflow/domain`) — cero precios duplicados. NO toca el cobro despacho→cliente (Stripe Connect).
 *
 * Seguridad / contrato:
 *  - La clave se lee de la variable de entorno STRIPE_SECRET_KEY (NUNCA se incrusta ni se pide por consola).
 *  - `--mode test|live` exige que la clave tenga el prefijo correcto (sk_test_ / sk_live_ o rk_…).
 *  - `--dry-run` no escribe nada en Stripe: imprime una TABLA con lo que crearía/archivaría.
 *  - Idempotente: cada Price lleva un `lookup_key` estable; si ya existe, se reutiliza (no se duplica).
 *  - `--archive-old` desactiva (archiva) los Price ACTIVOS de nuestros productos que NO estén en el
 *     esquema nuevo. Archivar un Price NO cancela las suscripciones existentes (grandfathering a salvo).
 *  - Al terminar escribe los Price IDs a `scripts/stripe-prices.<mode>.json` (mapa clave→price_id) listo
 *     para pegar en la variable de entorno STRIPE_PRICE_MAP.
 *
 * Uso:
 *   STRIPE_SECRET_KEY=sk_test_… node scripts/setup-stripe.mjs --mode test --dry-run
 *   STRIPE_SECRET_KEY=sk_test_… node scripts/setup-stripe.mjs --mode test
 *   STRIPE_SECRET_KEY=sk_live_… node scripts/setup-stripe.mjs --mode live
 *   …--mode live --archive-old      (tras validar el esquema nuevo)
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Stripe from 'stripe';
import {
  DEFAULT_FX,
  FOUNDER,
  PLAN_BILLING_CURRENCIES,
  PLAN_TIERS,
  buildPlanCatalog,
  planPriceKey,
  toStripeMinor,
} from '@legalflow/domain';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const mode = val('--mode', 'test');
const dryRun = has('--dry-run');
const archiveOld = has('--archive-old');

if (mode !== 'test' && mode !== 'live') {
  console.error('✖ --mode debe ser "test" o "live".');
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('✖ Falta STRIPE_SECRET_KEY en el entorno. No se incrusta en el script por seguridad.');
  process.exit(1);
}
// Verificación de coherencia clave↔modo para no escribir en LIVE por error.
const isLiveKey = key.startsWith('sk_live_') || key.startsWith('rk_live_');
const isTestKey = key.startsWith('sk_test_') || key.startsWith('rk_test_');
if (mode === 'live' && !isLiveKey) {
  console.error('✖ --mode live requiere una clave sk_live_/rk_live_. Abortando para no mezclar entornos.');
  process.exit(1);
}
if (mode === 'test' && !isTestKey) {
  console.error('✖ --mode test requiere una clave sk_test_/rk_test_. Abortando.');
  process.exit(1);
}

// FX override opcional (EUR canónico).
const fx = { ...DEFAULT_FX };
if (Number(process.env.PLAN_FX_USD) > 0) fx.USD = Number(process.env.PLAN_FX_USD);

const stripe = new Stripe(key);

// ── Plan del catálogo → filas a crear ──────────────────────────────────────────
const PRODUCTS = [
  ...PLAN_TIERS.map((t) => ({ plan: t.id, name: `Lawzora — ${titleCase(t.id)}` })),
  { plan: 'FOUNDER', name: 'Lawzora — Fundador' },
];
function titleCase(id) {
  return id.charAt(0) + id.slice(1).toLowerCase();
}
function lookupKey(plan, cycle, currency) {
  return `lawzora_${plan}_${cycle}_${currency}`.toLowerCase();
}

const catalog = buildPlanCatalog(fx, PLAN_BILLING_CURRENCIES);

function intervalLabel(row) {
  return row.stripeIntervalCount > 1
    ? `${row.stripeIntervalCount} ${row.stripeInterval}s`
    : row.stripeInterval;
}

// ── Dry-run: imprime la tabla y sale ────────────────────────────────────────────
function printTable() {
  console.log(`\nLawzora · Stripe setup (${mode.toUpperCase()})${dryRun ? ' · DRY-RUN' : ''}\n`);
  console.log('Products:');
  for (const p of PRODUCTS) console.log(`  • ${p.name}  [metadata.lawzora_plan=${p.plan}]`);
  console.log('\nPrices (unit_amount = por plaza y periodo; quantity = nº de plazas):');
  const rows = catalog.map((r) => ({
    key: planPriceKey(r.plan, r.cycle, r.currency),
    lookup: lookupKey(r.plan, r.cycle, r.currency),
    amount: `${r.perSeatPeriod} ${r.currency}`,
    minor: toStripeMinor(r.perSeatPeriod),
    interval: intervalLabel(r),
    equiv: `${r.perSeatMonthly} ${r.currency}/mes`,
    save: r.savingsPct ? `−${r.savingsPct}%` : '',
  }));
  const w = (s, n) => String(s).padEnd(n);
  console.log(
    '  ' +
      w('KEY', 28) +
      w('IMPORTE', 14) +
      w('INTERVALO', 12) +
      w('EQUIV.', 18) +
      'AHORRO',
  );
  for (const r of rows) {
    console.log('  ' + w(r.key, 28) + w(r.amount, 14) + w(r.interval, 12) + w(r.equiv, 18) + r.save);
  }
  console.log(`\nTotal: ${PRODUCTS.length} products · ${rows.length} prices.`);
  console.log(
    archiveOld
      ? '\nArchivado: se desactivarán los Price activos de estos productos que NO estén arriba.'
      : '\nArchivado: ninguno (usa --archive-old para desactivar los Price del esquema antiguo).',
  );
}

async function findProduct(plan) {
  // Idempotencia de producto: buscamos por metadata.lawzora_plan entre los productos existentes.
  for await (const p of stripe.products.list({ limit: 100, active: true })) {
    if (p.metadata && p.metadata.lawzora_plan === plan) return p;
  }
  return null;
}

async function ensureProduct(plan, name) {
  const existing = await findProduct(plan);
  if (existing) return existing;
  return stripe.products.create({ name, metadata: { lawzora_plan: plan } });
}

async function findPriceByLookup(lk) {
  const res = await stripe.prices.list({ lookup_keys: [lk], limit: 1 });
  return res.data[0] ?? null;
}

async function run() {
  printTable();
  if (dryRun) {
    console.log('\n(DRY-RUN) No se ha escrito nada en Stripe.\n');
    return;
  }

  const priceMap = {};
  const productByPlan = {};
  for (const p of PRODUCTS) {
    const product = await ensureProduct(p.plan, p.name);
    productByPlan[p.plan] = product.id;
    console.log(`Product ${p.plan}: ${product.id}`);
  }

  const newLookups = new Set();
  for (const r of catalog) {
    const lk = lookupKey(r.plan, r.cycle, r.currency);
    newLookups.add(lk);
    const key = planPriceKey(r.plan, r.cycle, r.currency);
    const existing = await findPriceByLookup(lk);
    if (existing) {
      priceMap[key] = existing.id;
      console.log(`= price ${key}: ${existing.id} (ya existía)`);
      continue;
    }
    const created = await stripe.prices.create({
      product: productByPlan[r.plan],
      currency: r.currency.toLowerCase(),
      unit_amount: toStripeMinor(r.perSeatPeriod),
      recurring: { interval: r.stripeInterval, interval_count: r.stripeIntervalCount },
      lookup_key: lk,
      transfer_lookup_key: true,
      metadata: { lawzora_plan: r.plan, lawzora_cycle: r.cycle },
    });
    priceMap[key] = created.id;
    console.log(`+ price ${key}: ${created.id}`);
  }

  if (archiveOld) {
    for (const plan of Object.keys(productByPlan)) {
      for await (const pr of stripe.prices.list({ product: productByPlan[plan], active: true, limit: 100 })) {
        if (!pr.lookup_key || !newLookups.has(pr.lookup_key)) {
          await stripe.prices.update(pr.id, { active: false });
          console.log(`− archivado price antiguo: ${pr.id} (${pr.lookup_key ?? 'sin lookup_key'})`);
        }
      }
    }
  }

  const outFile = join(__dirname, `stripe-prices.${mode}.json`);
  writeFileSync(outFile, JSON.stringify(priceMap, null, 2) + '\n', 'utf8');
  console.log(`\n✔ Hecho. Price IDs escritos en ${outFile}`);
  console.log('   Pega su contenido en la variable de entorno STRIPE_PRICE_MAP (una sola línea JSON).');
}

run().catch((e) => {
  console.error('✖ Error:', e?.message ?? e);
  process.exit(1);
});
