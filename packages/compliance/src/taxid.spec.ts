import { TaxIdKind } from '@legalflow/domain';
import { validateDoTaxId, validateEsTaxId } from './taxid';

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
