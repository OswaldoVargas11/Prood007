import { canonicalJson } from './ledger.service';

/**
 * L-5: la huella de la cadena fiscal debe ser reproducible tras el round-trip de jsonb (que reordena
 * las claves). `canonicalJson` ordena claves recursivamente, así que el orden de inserción no afecta.
 */
describe('canonicalJson', () => {
  it('produce la misma cadena independientemente del orden de claves', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { z: 9, y: 8 } });
    const b = canonicalJson({ c: { y: 8, z: 9 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"y":8,"z":9}}');
  });

  it('maneja arrays (preserva orden), null y primitivos', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(42)).toBe('42');
  });
});
