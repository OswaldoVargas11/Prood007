import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { HibpService } from '../src/auth/hibp.service';

/**
 * Cobertura del servicio HIBP (k-anonymity) con `fetch` mockeado para no depender de red.
 * Verifica: desactivado (no llama), detección de filtrada, contraseña limpia, y FAIL-OPEN ante
 * error de red / respuesta no OK. Está en src/auth/** (entra en el gate de cobertura e2e).
 */
describe('HibpService (e2e)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  const make = (enabled: boolean) =>
    new HibpService({
      get: (key: string) => (key === 'HIBP_ENABLED' ? (enabled ? 'true' : 'false') : undefined),
    } as unknown as ConfigService);

  const suffixOf = (password: string) =>
    createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase().slice(5);

  it('desactivado: no consulta y permite la contraseña', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    await expect(make(false).assertNotBreached('password')).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('activado + contraseña filtrada: rechaza con BadRequest', async () => {
    const pwd = 'P@ssw0rd-Leaked!';
    const body = `0000000000000000000000000000000000A:3\r\n${suffixOf(pwd)}:99\r\nFFFF:1`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(body),
    }) as unknown as typeof fetch;
    await expect(make(true).assertNotBreached(pwd)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activado + contraseña no filtrada: permite', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('0000000000000000000000000000000000A:3\r\nBBBBB:1'),
    }) as unknown as typeof fetch;
    await expect(make(true).assertNotBreached('UnaClaveLimpia#2026')).resolves.toBeUndefined();
  });

  it('fail-open: si fetch lanza (red caída/timeout) permite la contraseña', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    await expect(make(true).assertNotBreached('cualquiercosa')).resolves.toBeUndefined();
  });

  it('fail-open: si la respuesta no es OK (p. ej. 503) permite la contraseña', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(''),
    }) as unknown as typeof fetch;
    await expect(make(true).assertNotBreached('cualquiercosa')).resolves.toBeUndefined();
  });
});
