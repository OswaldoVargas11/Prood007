/**
 * Reset Stripe customer/subscription IDs (de TEST) al pasar a claves LIVE.
 *
 * Al cambiar STRIPE_SECRET_KEY de test→live, los `stripeCustomerId`/`stripeSubscriptionId`
 * guardados apuntan a objetos del modo TEST que NO existen en live → el Checkout falla con
 * "No such customer". Como en live todavía nadie tiene suscripción real, vaciamos esos campos
 * para que el siguiente Checkout cree un cliente live nuevo. Idempotente.
 *
 * Uso: node scripts/reset-stripe-ids.mjs   (lee SYSTEM_DATABASE_URL de .env.production)
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

loadEnv(new URL('../.env.production', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const url = process.env.SYSTEM_DATABASE_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('No SYSTEM_DATABASE_URL/DATABASE_URL disponible.');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const before = await prisma.tenant.findMany({
    where: { OR: [{ stripeCustomerId: { not: null } }, { stripeSubscriptionId: { not: null } }] },
    select: { id: true, name: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  console.log(`Despachos con IDs de Stripe a limpiar: ${before.length}`);
  for (const t of before) {
    console.log(`  · ${t.name} — cust=${t.stripeCustomerId ?? '∅'} sub=${t.stripeSubscriptionId ?? '∅'}`);
  }
  const res = await prisma.tenant.updateMany({
    where: { OR: [{ stripeCustomerId: { not: null } }, { stripeSubscriptionId: { not: null } }] },
    data: { stripeCustomerId: null, stripeSubscriptionId: null },
  });
  console.log(`Limpiados: ${res.count}`);
} finally {
  await prisma.$disconnect();
}
