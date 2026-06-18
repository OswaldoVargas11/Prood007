'use client';

import type { PlatformTenant } from './types';

/**
 * Cliente del SUPER-ADMIN de plataforma. Auth SEPARADA de la del despacho: el token de plataforma se
 * guarda en sessionStorage y se manda como Bearer a /api/platform/*. No usa el cliente `api` (que es
 * del despacho, con su access token + refresh por BFF).
 */
const TOKEN_KEY = 'lf_platform_token';

function base(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

export function getPlatformToken(): string | null {
  return typeof window !== 'undefined' ? window.sessionStorage.getItem(TOKEN_KEY) : null;
}
export function setPlatformToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

export async function platformLogin(email: string, password: string): Promise<void> {
  const res = await fetch(`${base()}/api/platform/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('login');
  const data = (await res.json()) as { accessToken: string };
  setPlatformToken(data.accessToken);
}

async function platformFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getPlatformToken();
  const res = await fetch(`${base()}/api/platform${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    setPlatformToken(null);
    throw new Error('unauth');
  }
  if (!res.ok) throw new Error(`err ${res.status}`);
  return res.json() as Promise<T>;
}

export const platformApi = {
  listTenants: () => platformFetch<PlatformTenant[]>('/tenants'),
  extendTrial: (id: string, days: number) =>
    platformFetch<PlatformTenant>(`/tenants/${id}/trial`, { method: 'PATCH', body: { days } }),
  setSubscription: (id: string, status: string, seats?: number) =>
    platformFetch<PlatformTenant>(`/tenants/${id}/subscription`, {
      method: 'PATCH',
      body: { status, ...(seats !== undefined ? { seats } : {}) },
    }),
};
