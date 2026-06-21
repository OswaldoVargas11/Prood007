/**
 * Cliente API de Lawzora.
 *
 * - El **access token vive en memoria** (no en localStorage) — ver D-014.
 * - Las llamadas de **datos** van directas a la API Nest (`NEXT_PUBLIC_API_URL`) con `Authorization:
 *   Bearer`. Ante un 401 se refresca una vez.
 * - El **refresh** lo gestiona el BFF de Next (`/api/auth/refresh`, mismo origen) que lee la cookie
 *   httpOnly del refresh token y devuelve un nuevo access. El cliente nunca ve el refresh token.
 * - El cliente **nunca** envía `tenantId`: el aislamiento lo hace el servidor (JWT + RLS).
 */

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

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

// Refresh compartido: si varias requests fallan con 401 a la vez, solo se refresca una vez.
let refreshInFlight: Promise<boolean> | null = null;

/** Pide al BFF un nuevo access token usando la cookie httpOnly del refresh. */
export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return true;
      } catch {
        setAccessToken(null);
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Si false, no adjunta el token ni reintenta refresh (rutas públicas). */
  auth?: boolean;
  _retried?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${apiBaseUrl()}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 401 && auth && !opts._retried) {
    const ok = await refreshAccessToken();
    if (ok) return request<T>(path, { ...opts, _retried: true });
  }

  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
    const raw = (payload as { message?: string | string[] } | undefined)?.message;
    const message = Array.isArray(raw) ? raw.join(', ') : (raw ?? `Error ${res.status}`);
    throw new ApiError(res.status, message, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = undefined;
  }
  const raw = (payload as { message?: string | string[] } | undefined)?.message;
  const message = Array.isArray(raw) ? raw.join(', ') : (raw ?? `Error ${res.status}`);
  return new ApiError(res.status, message, payload);
}

/** Subida multipart (FormData). No fija Content-Type (el navegador pone el boundary). */
async function upload<T>(path: string, form: FormData, _retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${apiBaseUrl()}/api${path}`, { method: 'POST', headers, body: form });
  if (res.status === 401 && !_retried && (await refreshAccessToken())) {
    return upload<T>(path, form, true);
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Descarga autenticada → Blob (para visores/descargas; el endpoint exige Bearer). */
async function download(path: string, _retried = false): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${apiBaseUrl()}/api${path}`, { headers });
  if (res.status === 401 && !_retried && (await refreshAccessToken())) {
    return download(path, true);
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res.blob();
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload,
  download,
};
