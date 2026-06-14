/**
 * Validación real de identificadores fiscales con dígito/letra de control.
 *  - España: NIF (DNI), NIE y CIF.
 *  - República Dominicana: RNC (9 dígitos) y Cédula (11 dígitos).
 * Agnóstico de framework; lo consumen los providers de cumplimiento.
 */
import { TaxIdKind } from '@legalflow/domain';

export interface TaxIdCheck {
  valid: boolean;
  kind?: TaxIdKind;
  normalized?: string;
}

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function nifLetter(num: number): string {
  return NIF_LETTERS[num % 23]!;
}

/** NIF/DNI: 8 dígitos + letra de control. */
function isValidNif(value: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(value);
  if (!m) return false;
  return nifLetter(Number(m[1])) === m[2];
}

/** NIE: [XYZ] + 7 dígitos + letra; X→0, Y→1, Z→2 y luego cálculo de NIF. */
function isValidNie(value: string): boolean {
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(value);
  if (!m) return false;
  const prefix = { X: '0', Y: '1', Z: '2' }[m[1] as 'X' | 'Y' | 'Z'];
  return nifLetter(Number(prefix + m[2])) === m[3];
}

/** CIF: letra de organización + 7 dígitos + control (dígito o letra según tipo). */
function isValidCif(value: string): boolean {
  const m = /^([A-HJ-NP-SUVW])(\d{7})([0-9A-J])$/.exec(value);
  if (!m) return false;
  const [, letter, digits, control] = m as unknown as [string, string, string, string];

  let sumOdd = 0;
  let sumEven = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(digits[i]);
    if (i % 2 === 0) {
      const d = n * 2;
      sumOdd += d > 9 ? Math.floor(d / 10) + (d % 10) : d;
    } else {
      sumEven += n;
    }
  }
  const unit = (sumOdd + sumEven) % 10;
  const controlDigit = unit === 0 ? 0 : 10 - unit;
  const controlLetter = 'JABCDEFGHI'[controlDigit]!;

  if ('KPQRSNW'.includes(letter)) return control === controlLetter;
  if ('ABEH'.includes(letter)) return control === String(controlDigit);
  return control === String(controlDigit) || control === controlLetter;
}

export function validateEsTaxId(raw: string): TaxIdCheck {
  const normalized = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  if (isValidNif(normalized)) return { valid: true, kind: TaxIdKind.NIF, normalized };
  if (isValidNie(normalized)) return { valid: true, kind: TaxIdKind.NIE, normalized };
  if (isValidCif(normalized)) return { valid: true, kind: TaxIdKind.CIF, normalized };
  return { valid: false };
}

/** RNC (DGII): 9 dígitos con dígito verificador por pesos [7,9,8,6,5,4,3,2]. */
function isValidRnc(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(value[i]) * weights[i]!;
  const mod = sum % 11;
  const check = mod === 0 ? 2 : mod === 1 ? 1 : 11 - mod;
  return Number(value[8]) === check;
}

/** Cédula dominicana: 11 dígitos con verificación tipo Luhn (módulo 10). */
function isValidCedula(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let p = Number(value[i]) * (i % 2 === 0 ? 1 : 2);
    if (p > 9) p -= 9;
    sum += p;
  }
  const check = (10 - (sum % 10)) % 10;
  return Number(value[10]) === check;
}

export function validateDoTaxId(raw: string): TaxIdCheck {
  const normalized = raw.trim().replace(/[\s-]/g, '');
  if (isValidRnc(normalized)) return { valid: true, kind: TaxIdKind.RNC, normalized };
  if (isValidCedula(normalized)) return { valid: true, kind: TaxIdKind.CEDULA, normalized };
  return { valid: false };
}
