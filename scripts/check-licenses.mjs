#!/usr/bin/env node
/**
 * Gate de licencias: falla si alguna dependencia de PRODUCCIÓN usa una licencia incompatible con
 * un SaaS propietario (copyleft fuerte o licencias de fuente no abierta). Lee el JSON de
 * `pnpm licenses list --prod --json` por stdin o desde el primer argumento.
 *
 * Filosofía: lista de DENEGADAS explícita (no allowlist) para no romper ante una licencia nueva
 * benigna; las que importan vetar son las víricas/restrictivas. Ajustable en DECISIONS D-017.
 */
import { readFileSync } from 'node:fs';

const DENY = [
  /\bAGPL/i,
  /\bGPL-2/i,
  /\bGPL-3/i,
  /\bGPL\b/i, // GPL "a secas"
  /\bSSPL/i,
  /\bBUSL/i,
  /\bBusiness Source/i,
  /Commons[- ]Clause/i,
  /CC-BY-NC/i,
  /\bWTFPL/i,
];
// LGPL se permite (enlazado dinámico). Si se quisiera vetar, añadir /\bLGPL/i arriba.

function load() {
  const arg = process.argv[2];
  const raw = arg ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

function* iterate(data) {
  if (Array.isArray(data)) {
    for (const pkg of data) yield { license: pkg.license ?? 'UNKNOWN', name: pkg.name, version: pkg.version };
  } else if (data && typeof data === 'object') {
    // Forma { "MIT": [ {name, versions/version}, ... ], ... }
    for (const [license, pkgs] of Object.entries(data)) {
      for (const pkg of pkgs ?? []) {
        const version = pkg.version ?? (Array.isArray(pkg.versions) ? pkg.versions.join(',') : '');
        yield { license, name: pkg.name, version };
      }
    }
  }
}

let data;
try {
  data = load();
} catch (e) {
  console.error('No se pudo leer el JSON de licencias:', e.message);
  process.exit(1);
}

/**
 * ¿La licencia está prohibida? Semántica SPDX:
 *  - Expresión OR (dual-license, p. ej. "(BSD-3-Clause OR GPL-2.0)"): el licenciatario ELIGE una; basta
 *    con que UNA alternativa esté permitida para usar el paquete (elegimos la permisiva). Solo se deniega
 *    si TODAS las alternativas están denegadas.
 *  - Resto (licencia simple o expresión AND): se exige cumplir TODO → si algo casa con DENY, se deniega.
 */
function isDenied(license) {
  const orParts = license.split(/\s+OR\s+/i).map((s) => s.replace(/[()]/g, '').trim());
  if (orParts.length > 1) {
    return orParts.every((part) => DENY.some((re) => re.test(part)));
  }
  return DENY.some((re) => re.test(license));
}

const violations = [];
for (const { license, name, version } of iterate(data)) {
  if (isDenied(license)) {
    violations.push(`${name}@${version} → ${license}`);
  }
}

if (violations.length) {
  console.error('❌ Licencias no permitidas en dependencias de producción:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('\nRevisa DECISIONS D-017 (gate de licencias).');
  process.exit(1);
}

console.log('✅ Sin licencias prohibidas en dependencias de producción.');
