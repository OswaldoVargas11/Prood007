/**
 * Generadores de identificadores fiscales VÁLIDOS (con dígito de control correcto) pero OBVIAMENTE
 * ficticios — los valida el ComplianceProvider al alta de cliente, así que han de pasar el control.
 *   · ES: NIF (persona) y CIF (sociedad, letra B = S.L.).
 *   · RD: RNC (empresa) y Cédula (persona).
 * Reutiliza la matemática ya probada en `seed-demo-firms.mjs`.
 */

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** NIF español: 8 dígitos + letra de control. */
export function nif(seed) {
  const num = String(seed).padStart(8, '0').slice(0, 8);
  return num + NIF_LETTERS[Number(num) % 23];
}

/** CIF español (sociedad). Prefijo B (S.L.) + 7 dígitos + dígito de control. */
export function cif(seed) {
  const d = String(seed).padStart(7, '0').slice(0, 7);
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(d[i]);
    if (i % 2 === 0) {
      const x = n * 2;
      odd += x > 9 ? Math.floor(x / 10) + (x % 10) : x;
    } else {
      even += n;
    }
  }
  const unit = (odd + even) % 10;
  return 'B' + d + (unit === 0 ? 0 : 10 - unit);
}

const RNC_W = [7, 9, 8, 6, 5, 4, 3, 2];

/** RNC dominicano (empresa): 9 dígitos con control módulo 11. */
export function rnc(seed) {
  const d = String(seed).padStart(8, '0').slice(0, 8);
  let s = 0;
  for (let i = 0; i < 8; i++) s += Number(d[i]) * RNC_W[i];
  const m = s % 11;
  return d + String(m === 0 ? 2 : m === 1 ? 1 : 11 - m);
}

/** Cédula dominicana (persona): 11 dígitos con control Luhn. */
export function cedula(seed) {
  const d = String(seed).padStart(10, '0').slice(0, 10);
  let s = 0;
  for (let i = 0; i < 10; i++) {
    let p = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (p > 9) p -= 9;
    s += p;
  }
  return d + String((10 - (s % 10)) % 10);
}

/** Clasificación legible del identificador (para Client.taxIdKind). */
export function taxIdKind(taxId) {
  const t = String(taxId);
  if (/^[A-HJ-NP-SUVW]\d{7}[0-9A-J]$/.test(t)) return 'CIF';
  if (/^\d{8}[A-Z]$/.test(t)) return 'NIF';
  if (/^\d{9}$/.test(t)) return 'RNC';
  if (/^\d{11}$/.test(t)) return 'CEDULA';
  return null;
}
