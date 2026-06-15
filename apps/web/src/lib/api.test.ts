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

  it('une los mensajes de error en array (validación) y conserva el status', async () => {
    setAccessToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: ['campo A', 'campo B'] }, 400));
    await expect(api.post('/clients', {})).rejects.toMatchObject({
      status: 400,
      message: 'campo A, campo B',
    });
  });

  it('devuelve undefined en 204 sin cuerpo', async () => {
    setAccessToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.del('/clients/1')).resolves.toBeUndefined();
  });

  it('usa "Error <status>" cuando el cuerpo de error no es JSON', async () => {
    setAccessToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<<html>>', { status: 500, headers: { 'content-type': 'text/html' } }),
    );
    await expect(api.get('/clients')).rejects.toMatchObject({ status: 500, message: 'Error 500' });
  });
});

describe('api.upload (multipart con refresh)', () => {
  beforeEach(() => setAccessToken(null));
  afterEach(() => vi.restoreAllMocks());

  it('sube FormData con Bearer y sin Content-Type manual', async () => {
    setAccessToken('tok');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'doc-1' }));
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.txt');
    const res = await api.upload<{ id: string }>('/documents', form);
    expect(res.id).toBe('doc-1');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('ante 401 refresca y reintenta la subida una vez', async () => {
    setAccessToken('expired');
    let dataCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/auth/refresh')) return json({ accessToken: 'new' });
      dataCalls += 1;
      return dataCalls === 1 ? json({ message: 'no' }, 401) : json({ id: 'doc-2' });
    });
    const res = await api.upload<{ id: string }>('/documents', new FormData());
    expect(res.id).toBe('doc-2');
    expect(getAccessToken()).toBe('new');
  });

  it('lanza ApiError si la subida falla', async () => {
    setAccessToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'demasiado grande' }, 413));
    await expect(api.upload('/documents', new FormData())).rejects.toBeInstanceOf(ApiError);
  });
});

describe('api.download (blob autenticado con refresh)', () => {
  beforeEach(() => setAccessToken(null));
  afterEach(() => vi.restoreAllMocks());

  it('descarga un Blob adjuntando Bearer', async () => {
    setAccessToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('contenido', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );
    const blob = await api.download('/documents/1/download');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('ante 401 refresca y reintenta la descarga', async () => {
    setAccessToken('expired');
    let dataCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/auth/refresh')) return json({ accessToken: 'new' });
      dataCalls += 1;
      return dataCalls === 1 ? json({ message: 'no' }, 401) : new Response('ok', { status: 200 });
    });
    const blob = await api.download('/documents/1/download');
    expect(blob).toBeInstanceOf(Blob);
    expect(getAccessToken()).toBe('new');
  });

  it('lanza ApiError si la descarga falla', async () => {
    setAccessToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'no existe' }, 404));
    await expect(api.download('/documents/x/download')).rejects.toBeInstanceOf(ApiError);
  });
});
