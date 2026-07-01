#!/usr/bin/env node
/**
 * Lint anti-MISSING_MESSAGE para el web (next-intl).
 *
 * Causa raiz que tumbo prod (funds-flow, jun-2026): una clave i18n usada en un componente
 * pero AUSENTE en `apps/web/messages/es.json` renderiza `MISSING_MESSAGE` en runtime. `tsc` no
 * lo detecta porque las claves son strings. Este script cierra ese hueco para CI.
 *
 * Reglas del catalogo (ver apps/web/src/i18n/request.ts):
 *   - `es.json` es SIEMPRE la base.
 *   - `overrides/do.json` se fusiona (deep-merge) SOLO si la cookie `lf_jur=do`.
 *   - Clave ausente en es.json  => CRASH (MISSING_MESSAGE)         -> ERROR (este lint falla).
 *   - Clave ausente solo en do.json => fallback silencioso a ES    -> no es crash (fuera de alcance).
 *
 * Cobertura:
 *   1) Claves literales: mapeo scope-aware var->namespace (`const t = useTranslations('ns')`),
 *      asignando cada `t('key')` / `t.rich('key')` / `t.markup('key')` a la declaracion previa mas
 *      cercana del MISMO nombre de variable (maneja el patron de redeclarar `t` por componente).
 *   2) Claves dinamicas por enum: `t(`prefix.${value}`)` donde `value` recorre un enum Prisma.
 *      Se valida que cada valor del enum tenga subclave. El mapa ENUM_CHECKS es explicito y debe
 *      mantenerse al aniadir namespaces dinamicos nuevos.
 *
 * Uso: `node tools/i18n-check.mjs`  (exit 1 si hay claves ausentes).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');
const es = JSON.parse(fs.readFileSync(path.join(WEB, 'messages', 'es.json'), 'utf8'));

const get = (o, dotted) =>
  dotted.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
const has = (ns, key) => get(es, ns ? `${ns}.${key}` : key) !== undefined;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

// ---- 1) claves literales (scope-aware) ----
const declRe = /(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*useTranslations\(\s*(?:['"]([^'"]*)['"])?\s*\)/g;
const missing = [];
const seen = new Set();
for (const file of walk(path.join(WEB, 'src'))) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('useTranslations')) continue;
  const decls = [];
  let m;
  declRe.lastIndex = 0;
  while ((m = declRe.exec(src))) decls.push({ var: m[1], ns: m[2] ?? '', offset: m.index });
  if (!decls.length) continue;
  const vars = [...new Set(decls.map((d) => d.var))].map((v) => v.replace(/\$/g, '\\$'));
  const useRe = new RegExp(`\\b(${vars.join('|')})\\s*(?:\\.(?:rich|markup))?\\(\\s*['"]([^'"]+)['"]`, 'g');
  let u;
  while ((u = useRe.exec(src))) {
    const [, v, key] = u;
    if (key.includes('${') || key.includes('{')) continue; // dinamicas -> seccion 2
    let chosen = null;
    for (const d of decls) if (d.var === v && d.offset < u.index && (!chosen || d.offset > chosen.offset)) chosen = d;
    if (!chosen) continue;
    if (!has(chosen.ns, key)) {
      const full = chosen.ns ? `${chosen.ns}.${key}` : key;
      if (seen.has(full)) continue;
      seen.add(full);
      const line = src.slice(0, u.index).split('\n').length;
      missing.push(`${full}  <-  ${path.relative(ROOT, file).replace(/\\/g, '/')}:${line}`);
    }
  }
}

// ---- 2) claves dinamicas por enum (mantener sincronizado con schema.prisma) ----
const ENUM_CHECKS = {
  'deal.side': ['BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER'],
  'deal.role': ['PRINCIPAL', 'LEGAL_COUNSEL', 'FINANCIAL_ADVISOR', 'NOTARY', 'OTHER'],
  'deal.fundsFlow.kind': ['PAYMENT', 'ESCROW_DEPOSIT', 'ESCROW_RELEASE', 'FEE', 'ADJUSTMENT'],
  'deal.fundsFlow.status': ['PLANNED', 'SETTLED'],
  'deal.fundsFlow.escrowStatus': ['HELD', 'PARTIALLY_RELEASED', 'RELEASED'],
  'deal.milestoneKind': ['SIGNING', 'CLOSING', 'LONGSTOP', 'CONDITIONS_DEADLINE', 'FUNDS_FLOW', 'FILING', 'CUSTOM'],
  'deal.milestoneStatus': ['PENDING', 'DONE', 'MISSED'],
  'deal.disclosureStatus': ['DRAFT', 'AGREED'],
  'deal.filingStatus': ['PENDING', 'SUBMITTED', 'REGISTERED', 'REJECTED'],
  'deal.registry': ['REGISTRO_MERCANTIL', 'REGISTRO_PROPIEDAD', 'INDICE_UNICO_NOTARIAL', 'NOTARIA', 'REGISTRO_TITULOS_RD', 'CAMARA_COMERCIO_RD', 'OTHER'],
  'billing.ecf.statuses': ['NOT_APPLICABLE', 'STUBBED', 'PENDING', 'ACCEPTED', 'REJECTED'],
  'billing.invoiceStatus': ['DRAFT', 'ISSUED', 'SENT', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED'],
};
const enumMissing = [];
for (const [prefix, vals] of Object.entries(ENUM_CHECKS))
  for (const v of vals) if (get(es, `${prefix}.${v}`) === undefined) enumMissing.push(`${prefix}.${v}`);

// ---- report ----
const all = [...missing, ...enumMissing];
if (all.length === 0) {
  console.log('i18n-check: OK (todas las claves usadas existen en es.json)');
  process.exit(0);
}
console.error('i18n-check: FALTAN claves en apps/web/messages/es.json (MISSING_MESSAGE en prod):');
for (const f of missing) console.error('  [literal] ' + f);
for (const f of enumMissing) console.error('  [enum]    ' + f);
process.exit(1);
