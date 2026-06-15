import 'server-only';
import { cookies } from 'next/headers';

/**
 * Gestión de la cookie de sesión (refresh token) en el BFF de Next. La cookie es **httpOnly**, así
 * que el JS de cliente nunca la ve; solo los Route Handlers la leen/escriben. Ver D-014.
 */
import type { Scope } from '../scope';

export const SESSION_COOKIE = 'lf_session';
/** Ámbito de navegación (firm/client) para el gate de rol en el middleware de servidor. */
export const SCOPE_COOKIE = 'lf_scope';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7 días, igual que el refresh TTL del backend

/** URL de la API Nest para llamadas servidor→servidor (sin CORS). */
export function nestUrl(path: string): string {
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${base}/api${path}`;
}

export async function setSessionCookie(refreshToken: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(SCOPE_COOKIE);
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Fija el ámbito (no es secreto, pero httpOnly evita manipulación trivial desde el cliente). */
export async function setScopeCookie(scope: Scope): Promise<void> {
  (await cookies()).set(SCOPE_COOKIE, scope, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}
