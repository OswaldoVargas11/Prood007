import { TaxIdKind } from '@legalflow/domain';
import { validateDoTaxId, validateEsTaxId, validateForeignDoc } from './taxid';

describe('validateEsTaxId', () => {
  it('validates and normalizes Spanish NIF', () => {
    expect(validateEsTaxId('12345678-z')).toEqual({
      valid: true,
      kind: TaxIdKind.NIF,
      normalized: '12345678Z',
    });
  });

  it('validates Spanish NIE control letter', () => {
    expect(validateEsTaxId('X1234567L')).toEqual({
      valid: true,
      kind: TaxIdKind.NIE,
      normalized: 'X1234567L',
    });
  });

  it('validates Spanish CIF control character', () => {
    expect(validateEsTaxId('B12345674')).toEqual({
      valid: true,
      kind: TaxIdKind.CIF,
      normalized: 'B12345674',
    });
  });

  it('rejects Spanish identifiers with invalid control character', () => {
    expect(validateEsTaxId('12345678A')).toEqual({ valid: false });
    expect(validateEsTaxId('X1234567A')).toEqual({ valid: false });
    expect(validateEsTaxId('B12345670')).toEqual({ valid: false });
  });

  it('validates CIF whose control MUST be a letter (org type K/P/Q/R/S/N/W)', () => {
    // P → control letter obligatoria; para dígitos 1234567 la letra de control es "D".
    expect(validateEsTaxId('P1234567D')).toEqual({
      valid: true,
      kind: TaxIdKind.CIF,
      normalized: 'P1234567D',
    });
    expect(validateEsTaxId('P12345674')).toEqual({ valid: false }); // dígito no vale para P
  });

  it('validates CIF whose control may be digit OR letter (org type C/D/F/G/J/L/M/U/V)', () => {
    expect(validateEsTaxId('C12345674')).toEqual({
      valid: true,
      kind: TaxIdKind.CIF,
      normalized: 'C12345674',
    });
    expect(validateEsTaxId('C1234567D')).toEqual({
      valid: true,
      kind: TaxIdKind.CIF,
      normalized: 'C1234567D',
    });
  });

  it('rejects malformed identifiers (no pattern match)', () => {
    expect(validateEsTaxId('')).toEqual({ valid: false });
    expect(validateEsTaxId('ABC')).toEqual({ valid: false });
  });

  it('validates special NIF K/L/M (menor / no residente / extranjero)', () => {
    // K/L/M + 7 dígitos + letra de control calculada sobre los 7 dígitos (1234567 → L).
    expect(validateEsTaxId('K1234567L')).toEqual({
      valid: true,
      kind: TaxIdKind.NIF,
      normalized: 'K1234567L',
    });
    expect(validateEsTaxId('M1234567L')).toEqual({
      valid: true,
      kind: TaxIdKind.NIF,
      normalized: 'M1234567L',
    });
    expect(validateEsTaxId('K1234567A')).toEqual({ valid: false }); // letra de control incorrecta
  });

  it('valida un CIF cuyo dígito de control es 0 (suma múltiplo de 10)', () => {
    // Dígitos 0000000 → suma 0 → dígito de control 0 (rama unit===0). Org 'A' exige dígito.
    expect(validateEsTaxId('A00000000')).toEqual({
      valid: true,
      kind: TaxIdKind.CIF,
      normalized: 'A00000000',
    });
  });
});

describe('validateDoTaxId', () => {
  it('validates Dominican RNC check digit', () => {
    expect(validateDoTaxId('101-01010-1')).toEqual({
      valid: true,
      kind: TaxIdKind.RNC,
      normalized: '101010101',
    });
  });

  it('validates Dominican Cedula check digit', () => {
    expect(validateDoTaxId('001-1234567-3')).toEqual({
      valid: true,
      kind: TaxIdKind.CEDULA,
      normalized: '00112345673',
    });
  });

  it('rejects Dominican identifiers with invalid check digit', () => {
    expect(validateDoTaxId('101010100')).toEqual({ valid: false });
    expect(validateDoTaxId('00112345678')).toEqual({ valid: false });
  });
});

describe('validateForeignDoc (pasaporte / otro documento, validación ligera)', () => {
  it('acepta un documento alfanumérico y lo normaliza (mayúsculas, sin espacios)', () => {
    expect(validateForeignDoc('ab 1234', TaxIdKind.PASSPORT)).toEqual({
      valid: true,
      kind: TaxIdKind.PASSPORT,
      normalized: 'AB1234',
    });
    expect(validateForeignDoc('X1234567', TaxIdKind.OTHER)).toEqual({
      valid: true,
      kind: TaxIdKind.OTHER,
      normalized: 'X1234567',
    });
  });

  it('rechaza documentos demasiado cortos o con caracteres inválidos', () => {
    expect(validateForeignDoc('AB12', TaxIdKind.PASSPORT)).toEqual({ valid: false }); // < 5
    expect(validateForeignDoc('AB_123', TaxIdKind.PASSPORT)).toEqual({ valid: false }); // símbolo
    expect(validateForeignDoc('', TaxIdKind.OTHER)).toEqual({ valid: false });
  });
});
