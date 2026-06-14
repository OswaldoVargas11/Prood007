/**
 * Cliente API tipado de LegalFlow. Maneja el access token, refresca automáticamente con el refresh
 * token ante un 401, y centraliza el manejo de errores. Diseñado para usarse desde componentes
 * cliente (tokens en localStorage). Agnóstico de la UI.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ACCESS_KEY = 'lf.accessToken';
const REFRESH_KEY = 'lf.refreshToken';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

export const tokenStore = {
  get access(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(pair: TokenPair) {
    localStorage.setItem(ACCESS_KEY, pair.accessToken);
    localStorage.setItem(REFRESH_KEY, pair.refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Si false, no adjunta el token (rutas públicas). */
  auth?: boolean;
  /** Evita el reintento de refresh (uso interno). */
  _retried?: boolean;
}

async function rawRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;

  const res = await fetch(`${baseUrl()}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Refresh automático ante 401 (una sola vez).
  if (res.status === 401 && auth && !opts._retried && tokenStore.refresh) {
    const refreshed = await tryRefresh();
    if (refreshed) return rawRequest<T>(path, { ...opts, _retried: true });
  }

  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
    const message = (payload as { message?: string } | undefined)?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${baseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      tokenStore.clear();
      return false;
    }
    tokenStore.set((await res.json()) as TokenPair);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => rawRequest<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    rawRequest<T>(path, { method: 'POST', body, auth }),
  patch: <T>(path: string, body?: unknown) => rawRequest<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => rawRequest<T>(path, { method: 'DELETE' }),
  raw: rawRequest,
};
