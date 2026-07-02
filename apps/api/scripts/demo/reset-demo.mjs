#!/usr/bin/env node
/**
 * reset:demo — Borra los despachos de demo transaccional (sin volver a sembrar).
 *
 * SEGURO: solo toca tenants cuyo admin pertenece al dominio reservado `@demo.legalflow.invalid`
 * (ningún despacho real lo usa). Borra en cascada y purga el almacenamiento por prefijo de tenant.
 *
 * Uso:
 *   node apps/api/scripts/demo/reset-demo.mjs              # borra los 3 escenarios
 *   node apps/api/scripts/demo/reset-demo.mjs --scenario 2 # solo el escenario 2 (1|2|3|all)
 *   (vía pnpm)  pnpm reset:demo
 */
import { loadEnv, makePrisma } from './lib/env.mjs';
import { makeStorage } from './lib/storage.mjs';
import { wipeDemoTenants } from './lib/reset.mjs';
import { SCENARIOS, ALL_DEMO_ADMIN_EMAILS } from './scenarios/registry.mjs';

function parseArgs(argv) {
  let scenario = 'all';
  let production = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenario' || a === '-s') scenario = String(argv[++i] ?? 'all');
    else if (a.startsWith('--scenario=')) scenario = a.slice('--scenario='.length);
    else if (a === '--production' || a === '--prod') production = true;
    else if (/^[123]$/.test(a) || a === 'all') scenario = a;
  }
  return { scenario: scenario.toLowerCase(), production };
}

async function main() {
  const { scenario, production } = parseArgs(process.argv.slice(2));
  loadEnv({ production });

  let emails;
  if (scenario === 'all') {
    emails = ALL_DEMO_ADMIN_EMAILS;
  } else {
    const n = Number(scenario);
    if (![1, 2, 3].includes(n)) throw new Error('--scenario debe ser 1, 2, 3 o all.');
    emails = [SCENARIOS[n].adminEmail];
  }

  const prisma = makePrisma();
  const storage = makeStorage();
  try {
    const ids = await wipeDemoTenants(prisma, storage, emails);
    console.log(`✓ Reset de demos: ${ids.length} tenant(s) borrado(s).`);
    if (!ids.length) console.log('  (No había demos sembradas.)');
  } catch (e) {
    console.error('✗ Error en reset:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
