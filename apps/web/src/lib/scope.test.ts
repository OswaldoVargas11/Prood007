import { describe, expect, it } from 'vitest';
import { jurisdictionFromAccessToken, scopeFromAccessToken, scopeFromRoles } from './scope';

function tokenWithRoles(roles: string[]): string {
  const payload = Buffer.from(JSON.stringify({ roles })).toString('base64url');
  return `header.${payload}.sig`;
}

function tokenWithJur(jur: string): string {
  const payload = Buffer.from(JSON.stringify({ jur })).toString('base64url');
  return `header.${payload}.sig`;
}

describe('scope', () => {
  it('firm cuando hay rol de staff', () => {
    expect(scopeFromRoles(['FIRM_ADMIN'])).toBe('firm');
    expect(scopeFromRoles(['LAWYER'])).toBe('firm');
    expect(scopeFromRoles(['LAWYER', 'CLIENT'])).toBe('firm');
  });

  it('client cuando solo es CLIENT o no hay roles', () => {
    expect(scopeFromRoles(['CLIENT'])).toBe('client');
    expect(scopeFromRoles([])).toBe('client');
  });

  it('deriva el ámbito decodificando el JWT', () => {
    expect(scopeFromAccessToken(tokenWithRoles(['FIRM_ADMIN']))).toBe('firm');
    expect(scopeFromAccessToken(tokenWithRoles(['CLIENT']))).toBe('client');
  });

  it('ante un token inválido, devuelve client (cierra por defecto)', () => {
    expect(scopeFromAccessToken('no-es-un-jwt')).toBe('client');
  });

  it('ante un payload que no es JSON válido, devuelve client (catch)', () => {
    // El segundo segmento existe pero su base64url no decodifica a JSON → entra al catch.
    expect(scopeFromAccessToken('header.@@@@@@.sig')).toBe('client');
  });

  it('deriva la jurisdicción del JWT (do/es); ante duda, es', () => {
    expect(jurisdictionFromAccessToken(tokenWithJur('do'))).toBe('do');
    expect(jurisdictionFromAccessToken(tokenWithJur('es'))).toBe('es');
    expect(jurisdictionFromAccessToken(tokenWithJur('xx'))).toBe('es'); // valor raro → es
    expect(jurisdictionFromAccessToken('no-es-un-jwt')).toBe('es');
    expect(jurisdictionFromAccessToken('header.@@@@@@.sig')).toBe('es');
  });
});
