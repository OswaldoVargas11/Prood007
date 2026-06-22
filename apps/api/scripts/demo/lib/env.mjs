/**
 * Entorno + cliente Prisma PRIVILEGIADO para el seed de demos.
 *
 * RLS fail-closed (D-020): crear/borrar datos cross-tenant sin contexto de tenant DEBE pasar por el
 * rol de sistema (BYPASSRLS), nunca por ausencia de contexto en el rol de app. Usamos
 * SYSTEM_DATABASE_URL y, en su defecto (dev/CI), DIRECT_DATABASE_URL — el mismo criterio que
 * `SystemPrismaService` y que `ensure-demo-tenant.mjs`. NUNCA el rol de aplicación.
 *
 * Este script NO toca migraciones, RLS ni defaults fiscales: solo inserta datos de negocio (con
 * `tenantId` explícito en cada fila) usando el camino privilegiado, igual que el alta real de despacho.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Directorio del paquete apps/api (… /scripts/demo/lib → ../../..). */
export const API_DIR = resolve(__dirname, '..', '..', '..');
/** Raíz del monorepo. */
export const REPO_ROOT = resolve(API_DIR, '..', '..');

/** Carga variables de un .env sin pisar las ya presentes en el entorno. */
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // fichero opcional
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

/** Carga .env / .env.local de apps/api (y .env.production si se pide explícitamente). */
export function loadEnv({ production = false } = {}) {
  if (production) loadEnvFile(resolve(API_DIR, '.env.production'));
  loadEnvFile(resolve(API_DIR, '.env'));
  loadEnvFile(resolve(API_DIR, '.env.local'));
}

/** URL del rol privilegiado (BYPASSRLS). Falla en claro si no hay ninguna. */
export function privilegedDbUrl() {
  const url =
    process.env.SYSTEM_DATABASE_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'No hay SYSTEM_DATABASE_URL / DIRECT_DATABASE_URL / DATABASE_URL. El seed de demos opera ' +
        'cross-tenant y necesita el rol privilegiado (BYPASSRLS). Revisa apps/api/.env.',
    );
  }
  return url;
}

/** Cliente Prisma sobre el rol privilegiado. Recuerda hacer `await prisma.$disconnect()`. */
export function makePrisma() {
  return new PrismaClient({ datasources: { db: { url: privilegedDbUrl() } } });
}

// ── Identidad de las demos ────────────────────────────────────────────────────
// CLAVE de reconocimiento/borrado: el dominio de correo del admin. Es un dominio reservado .invalid
// que NINGÚN despacho real usaría → el reset jamás toca datos reales. Coexiste con las demos de
// ventas (`@demo.lawzora`) sin pisarlas.
export const DEMO_EMAIL_DOMAIN = '@demo.legalflow.invalid';
/** Marcador visible en el nombre del despacho para que se vea "esto es una demo". */
export const DEMO_NAME_SUFFIX = ' · DEMO';
/** Contraseña común a las 3 demos (fuerte; el login va por el rol normal tras el seed). */
export const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? 'Demo.Transaccional-2026!';

/** Helpers de fecha relativos a HOY (deterministas dentro de una ejecución). */
export const NOW = new Date();
export function daysFromNow(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
}
export function monthsAgo(m, day) {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - m);
  if (day != null) d.setDate(day);
  return d;
}
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
