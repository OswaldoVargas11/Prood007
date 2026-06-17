/**
 * Garantiza UN ÚNICO despacho demo para `admin@demo.test`, de forma IDEMPOTENTE.
 *
 * Por qué existe: el alta de despacho (`POST /auth/register-tenant`) NO es idempotente — cada
 * ejecución crea un tenant nuevo. Repetir el onboarding de la demo dejó al email `admin@demo.test`
 * presente en VARIOS despachos, y entonces el login falla con `auth.ambiguousTenant` ("El email
 * existe en varios despachos; indica el tenantId"). Feo al enseñar el producto.
 *
 * Qué hace (NO toca la lógica de auth, solo datos):
 *   1. Busca todos los despachos que tengan un usuario con el email demo.
 *   2. Si no hay ninguno → lo crea vía la API real (`/auth/register-tenant`), respetando validación.
 *   3. Si hay uno o más → conserva el más POBLADO (más clientes/expedientes/facturas), borra el resto
 *      en cascada, normaliza nombre/ID fiscal y RESETEA la contraseña del admin al valor documentado.
 *
 * RLS: el borrado y la actualización son CROSS-TENANT y sin contexto de tenant; con RLS fail-closed
 * (D-020) deben ir por el rol privilegiado. Usamos `SYSTEM_DATABASE_URL` y, en su defecto (dev/CI),
 * `DIRECT_DATABASE_URL` — el mismo criterio que `SystemPrismaService`. NUNCA el rol de app.
 *
 * Uso:  node apps/api/scripts/ensure-demo-tenant.mjs
 *       (también lo invoca seed-demo.mjs antes de sembrar, para que la demo arranque sin ambigüedad)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(__dirname, '..');

/** Carga variables de `.env`/`.env.local` de apps/api sin pisar las ya presentes en el entorno. */
function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    let raw;
    try {
      raw = readFileSync(resolve(API_DIR, file), 'utf8');
    } catch {
      continue; // fichero opcional
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

// Identidad canónica del despacho demo. Fija: es la "clave" por la que reconocemos/reutilizamos la demo.
const DEMO_EMAIL = (process.env.SEED_EMAIL ?? 'admin@demo.test').toLowerCase();
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Sup3rSecret!2026';
const DEMO_TENANT_NAME = process.env.SEED_TENANT_NAME ?? 'Despacho Demo';
const DEMO_TAX_ID = process.env.SEED_TENANT_TAXID ?? 'B12345678';
const DEMO_ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Admin Demo';
const DEMO_JURISDICTION = 'es';
const DEMO_CURRENCY = 'EUR';
const DEMO_LOCALE = 'es-ES';

function privilegedUrl() {
  const url = process.env.SYSTEM_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Ni SYSTEM_DATABASE_URL ni DIRECT_DATABASE_URL están definidos; el deduplicado cross-tenant ' +
        'necesita el rol privilegiado (BYPASSRLS). Revisa apps/api/.env.',
    );
  }
  return url;
}

/** Crea el despacho demo desde cero vía la API real (no reimplementa la lógica de auth). */
async function registerViaApi(api) {
  const res = await fetch(`${api}/auth/register-tenant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantName: DEMO_TENANT_NAME,
      jurisdiction: DEMO_JURISDICTION,
      currency: DEMO_CURRENCY,
      taxId: DEMO_TAX_ID,
      locale: DEMO_LOCALE,
      admin: { email: DEMO_EMAIL, password: DEMO_PASSWORD, fullName: DEMO_ADMIN_NAME },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `No había despacho demo y falló crearlo vía API (${res.status}: ${text.slice(0, 200)}). ` +
        '¿Está la API levantada en ' +
        api +
        '?',
    );
  }
}

/**
 * Asegura exactamente un despacho demo. Idempotente: ejecutarlo N veces deja siempre un único tenant.
 * @param {{ api?: string }} [opts]
 * @returns {Promise<{ tenantId: string, deleted: string[], created: boolean }>}
 */
export async function ensureSingleDemoTenant(opts = {}) {
  loadEnv();
  const api = opts.api ?? process.env.SEED_API ?? 'http://localhost:4000/api';
  const prisma = new PrismaClient({ datasources: { db: { url: privilegedUrl() } } });

  try {
    let admins = await prisma.user.findMany({ where: { email: DEMO_EMAIL } });

    // Caso 0: no existe la demo todavía → la creamos vía la API y refrescamos.
    let created = false;
    if (admins.length === 0) {
      console.log(`· No existe ${DEMO_EMAIL}; creando el despacho demo vía API…`);
      await registerViaApi(api);
      created = true;
      admins = await prisma.user.findMany({ where: { email: DEMO_EMAIL } });
    }

    // Para cada candidato, medir "riqueza" (datos sembrados) para conservar el mejor poblado.
    const scored = await Promise.all(
      admins.map(async (u) => {
        const tenantId = u.tenantId;
        const [clients, matters, invoices] = await Promise.all([
          prisma.client.count({ where: { tenantId } }),
          prisma.matter.count({ where: { tenantId } }),
          prisma.invoice.count({ where: { tenantId } }),
        ]);
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        return { user: u, tenant, richness: clients + matters + invoices };
      }),
    );

    // Conservar el más poblado; en empate, el más antiguo (el despacho original).
    scored.sort((a, b) => {
      if (b.richness !== a.richness) return b.richness - a.richness;
      return a.tenant.createdAt.getTime() - b.tenant.createdAt.getTime();
    });
    const keeper = scored[0];
    const losers = scored.slice(1);

    // Borrar duplicados (cascada de Tenant → borra usuarios, expedientes, facturas, etc.).
    const deleted = [];
    for (const l of losers) {
      await prisma.tenant.delete({ where: { id: l.tenant.id } });
      deleted.push(l.tenant.id);
      console.log(
        `· Borrado despacho duplicado ${l.tenant.id} (${JSON.stringify(l.tenant.name)}, ` +
          `riqueza=${l.richness}).`,
      );
    }

    // Normalizar el despacho conservado a la identidad canónica de la demo.
    await prisma.tenant.update({
      where: { id: keeper.tenant.id },
      data: {
        name: DEMO_TENANT_NAME,
        taxId: DEMO_TAX_ID,
        jurisdiction: DEMO_JURISDICTION,
        currency: DEMO_CURRENCY,
        locale: DEMO_LOCALE,
      },
    });

    // Resetear la contraseña del admin al valor documentado (idempotente) y reactivar la cuenta.
    const passwordHash = await argon2.hash(DEMO_PASSWORD);
    await prisma.user.update({
      where: { id: keeper.user.id },
      data: {
        passwordHash,
        isActive: true,
        fullName: keeper.user.fullName || DEMO_ADMIN_NAME,
        email: DEMO_EMAIL,
      },
    });

    console.log(
      `✓ Despacho demo único: ${keeper.tenant.id} (${JSON.stringify(DEMO_TENANT_NAME)}). ` +
        `${DEMO_EMAIL} ya inicia sesión sin ambigüedad.`,
    );
    return { tenantId: keeper.tenant.id, deleted, created };
  } finally {
    await prisma.$disconnect();
  }
}

// Permite ejecutarlo como CLI: node apps/api/scripts/ensure-demo-tenant.mjs
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  ensureSingleDemoTenant().catch((e) => {
    console.error('✗ Error al asegurar el despacho demo:', e.message);
    process.exit(1);
  });
}
