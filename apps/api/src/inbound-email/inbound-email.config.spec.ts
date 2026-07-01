import { parseMatterAddress } from './inbound-email.config';

/**
 * Regresión LAW-72: `parseMatterAddress` parsea la dirección BCC del expediente y debe hacerlo en
 * tiempo LINEAL (la regex previa tenía retroceso O(n²) → ReDoS sobre un `to` sin `@`).
 */
describe('parseMatterAddress', () => {
  it('parsea la forma canónica `archivar+<matterId>.<token>@dominio`', () => {
    expect(parseMatterAddress('archivar+matter123.abcdef@in.lawzora.com')).toEqual({
      matterId: 'matter123',
      token: 'abcdef',
    });
  });

  it('parsea la forma con nombre `Nombre <addr>`', () => {
    expect(parseMatterAddress('Despacho <archivar+m1.tok9@in.lawzora.com>')).toEqual({
      matterId: 'm1',
      token: 'tok9',
    });
  });

  it('parsea nombre sin ángulos `Nombre addr`', () => {
    expect(parseMatterAddress('Firma archivar+m2.t2@in.lawzora.com')).toEqual({
      matterId: 'm2',
      token: 't2',
    });
  });

  it('soporta un matterId con puntos (usa el ÚLTIMO punto para separar el token)', () => {
    expect(parseMatterAddress('archivar+ma.tt.er.tok@in.lawzora.com')).toEqual({
      matterId: 'ma.tt.er',
      token: 'tok',
    });
  });

  it('devuelve null si no hay `+` (sin matterId embebido)', () => {
    expect(parseMatterAddress('info@in.lawzora.com')).toBeNull();
    expect(parseMatterAddress('')).toBeNull();
    expect(parseMatterAddress('basura sin arroba')).toBeNull();
  });

  it('no sufre ReDoS: una entrada larga SIN `@` termina de inmediato', () => {
    const evil = 'a'.repeat(100_000); // sin '@': la regex previa retrocedía O(n²)
    const start = process.hrtime.bigint();
    expect(parseMatterAddress(evil)).toBeNull();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(ms).toBeLessThan(100);
  });
});
