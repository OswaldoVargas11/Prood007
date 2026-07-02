#!/usr/bin/env node
/**
 * seed:demo — Siembra los escenarios de demo transaccional, cada uno en su propio tenant AISLADO.
 *
 * Es IDEMPOTENTE y RESETEABLE: antes de sembrar un escenario, BORRA su tenant demo previo (por el
 * email de admin del dominio reservado), así que ejecutarlo de nuevo deja la demo limpia. Úsalo
 * justo antes de cada demo de ventas.
 *
 * Uso:
 *   node apps/api/scripts/demo/seed-demo.mjs                 # los 3 escenarios
 *   node apps/api/scripts/demo/seed-demo.mjs --scenario 1    # solo el escenario 1 (1|2|3|all)
 *   node apps/api/scripts/demo/seed-demo.mjs --production     # carga apps/api/.env.production
 *   (vía pnpm)  pnpm seed:demo --scenario 2
 *
 * Entorno: SYSTEM_DATABASE_URL / DIRECT_DATABASE_URL (rol privilegiado, RLS-bypass) en apps/api/.env.
 * Fiscal en SANDBOX: NO transmite a AEAT/DGII (no se usa DGII_ENV ni ningún .p12). Ver README.
 */
import { loadEnv, makePrisma, DEMO_PASSWORD, DEMO_EMAIL_DOMAIN } from './lib/env.mjs';
import { makeStorage } from './lib/storage.mjs';
import { wipeDemoTenants } from './lib/reset.mjs';
import { SCENARIOS } from './scenarios/registry.mjs';

function parseArgs(argv) {
  let scenario = 'all';
  let production = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenario' || a === '-s') scenario = String(argv[++i] ?? 'all');
    else if (a.startsWith('--scenario=')) scenario = a.slice('--scenario='.length);
    else if (a === '--production' || a === '--prod') production = true;
    else if (/^[123]$/.test(a) || a === 'all') scenario = a; // posicional
  }
  return { scenario: scenario.toLowerCase(), production };
}

function selectedKeys(scenario) {
  if (scenario === 'all') return [1, 2, 3];
  const n = Number(scenario);
  if (![1, 2, 3].includes(n)) {
    throw new Error(`--scenario debe ser 1, 2, 3 o all (recibido: "${scenario}").`);
  }
  return [n];
}

async function main() {
  const { scenario, production } = parseArgs(process.argv.slice(2));
  const keys = selectedKeys(scenario);
  loadEnv({ production });

  const prisma = makePrisma();
  const storage = makeStorage();
  const apiBase = (process.env.SEED_API ?? 'http://localhost:4000/api').replace(/\/$/, '');
  const webBase = process.env.SEED_WEB ?? 'http://localhost:3000';

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Seed de demos transaccionales (datos 100% ficticios)');
  console.log(`  Escenarios: ${keys.join(', ')}`);
  console.log(`  Almacenamiento: ${storage.label}`);
  console.log(`  Fiscal: SANDBOX (sin transmisión a AEAT/DGII, sin .p12)`);
  console.log('═══════════════════════════════════════════════════════════════');

  const results = [];
  try {
    for (const key of keys) {
      const cfg = SCENARIOS[key];
      console.log(`\n=== Escenario ${key}: ${cfg.label} ===`);
      // Reset idempotente de ESTE escenario (solo su email del dominio demo).
      const wiped = await wipeDemoTenants(prisma, storage, [cfg.adminEmail]);
      if (wiped.length) console.log(`  · Borrada demo previa (${wiped.length} tenant).`);
      const mod = await cfg.loader();
      const res = await mod.seed(prisma, storage, cfg);
      results.push({ key, cfg, res });
      console.log(`  ✓ ${cfg.name} sembrado.`);
    }
  } catch (e) {
    console.error('\n✗ Error al sembrar:', e.stack || e.message);
    process.exitCode = 1;
    return;
  } finally {
    await prisma.$disconnect();
  }

  // ── Resumen para arrancar la demo ──────────────────────────────────────────--
  console.log('\n════════════════════ DEMOS LISTAS ════════════════════');
  console.log(`Login: ${webBase}/es/login   ·   contraseña común: ${DEMO_PASSWORD}`);
  console.log(`(Los emails de demo usan el dominio reservado ${DEMO_EMAIL_DOMAIN}.)\n`);
  for (const { key, cfg, res } of results) {
    console.log(`Escenario ${key} — ${cfg.label}`);
    console.log(`  · Acceso:        ${cfg.adminEmail}`);
    console.log(`  · Despacho:      ${res.tenant.name}`);
    const dr = res.counts?.dataRoomToken;
    if (dr) {
      console.log(`  · Data room (enlace mágico, solo se muestra aquí):`);
      console.log(`      ${dr.url}`);
    }
    console.log('');
  }
  console.log('Vuelve a ejecutar `pnpm seed:demo` para resetear y dejar la demo limpia.');
}

main();
