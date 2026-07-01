import { firstQueryString } from './oauth-query.util';

/**
 * Regresión LAW-72: el normalizador del borde debe descartar cualquier forma que NO sea string
 * (array/objeto por `?state=a&state=b`), evitando la confusión de tipo en `verifyState`.
 */
describe('firstQueryString', () => {
  it('devuelve el string tal cual', () => {
    expect(firstQueryString('abc.def')).toBe('abc.def');
    expect(firstQueryString('')).toBe('');
  });

  it('descarta un ARRAY (parameter tampering `?state=a&state=b`)', () => {
    expect(firstQueryString(['a', 'b'])).toBeUndefined();
    expect(firstQueryString([])).toBeUndefined();
  });

  it('descarta objetos anidados (`?state[x]=1`)', () => {
    expect(firstQueryString({ x: '1' })).toBeUndefined();
  });

  it('descarta undefined/null/otros primitivos', () => {
    expect(firstQueryString(undefined)).toBeUndefined();
    expect(firstQueryString(null)).toBeUndefined();
    expect(firstQueryString(42)).toBeUndefined();
    expect(firstQueryString(true)).toBeUndefined();
  });
});
