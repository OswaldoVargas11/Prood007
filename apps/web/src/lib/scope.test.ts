import { describe, expect, it } from 'vitest';
import { scopeFromAccessToken, scopeFromRoles } from './scope';

function tokenWithRoles(roles: string[]): string {
  const payload = Buffer.from(JSON.stringify({ roles })).toString('base64url');
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
});
