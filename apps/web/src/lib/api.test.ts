import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getAccessToken, setAccessToken } from './api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('cliente API', () => {
  beforeEach(() => setAccessToken(null));
  afterEach(() => vi.restoreAllMocks());

  it('adjunta Authorization: Bearer cuando hay access token', async () => {
    setAccessToken('tok-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true }));
    await api.get('/clients');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('NO adjunta token cuando no hay sesión', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true }));
    await api.get('/health');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('ante 401 refresca vía BFF una vez y reintenta con el nuevo access', async () => {
    setAccessToken('expired');
    let dataCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'new-tok' });
      dataCalls += 1;
      return dataCalls === 1 ? json({ message: 'no' }, 401) : json({ total: 3 });
    });
    const data = await api.get<{ total: number }>('/clients');
    expect(data.total).toBe(3);
    expect(getAccessToken()).toBe('new-tok');
  });

  it('si el refresh falla, lanza ApiError y limpia el access', async () => {
    setAccessToken('expired');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) return json({ message: 'sin sesión' }, 401);
      return json({ message: 'no autorizado' }, 401);
    });
    await expect(api.get('/clients')).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
  });
});
