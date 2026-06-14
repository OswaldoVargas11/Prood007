import 'server-only';
import { cookies } from 'next/headers';

/**
 * Gestión de la cookie de sesión (refresh token) en el BFF de Next. La cookie es **httpOnly**, así
 * que el JS de cliente nunca la ve; solo los Route Handlers la leen/escriben. Ver D-014.
 */
export const SESSION_COOKIE = 'lf_session';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7 días, igual que el refresh TTL del backend

/** URL de la API Nest para llamadas servidor→servidor (sin CORS). */
export function nestUrl(path: string): string {
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${base}/api${path}`;
}

export function setSessionCookie(refreshToken: string): void {
  cookies().set(SESSION_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

export function getSessionToken(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}
