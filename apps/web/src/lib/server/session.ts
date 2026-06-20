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
/** Jurisdicción del despacho (es/do): gobierna la terminología fiscal del catálogo i18n en servidor. */
export const JURISDICTION_COOKIE = 'lf_jur';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7 días, igual que el refresh TTL del backend

/** URL de la API Nest para llamadas servidor→servidor (sin CORS). */
export function nestUrl(path: string): string {
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${base}/api${path}`;
}

/**
 * Defensa anti-CSRF para los handlers BFF que mutan estado por cookie: si la petición trae cabecera
 * `Origin` y NO coincide con el host, es una petición cross-site → bloquear. Sin `Origin` no se bloquea
 * (clientes no-navegador); el `SameSite=Lax` de la cookie cubre el resto. Complementa, no sustituye.
 */
export function isCrossOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
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
  store.delete(JURISDICTION_COOKIE);
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

/** Fija la jurisdicción del despacho (es/do). La lee el servidor i18n para elegir el catálogo. */
export async function setJurisdictionCookie(jur: 'es' | 'do'): Promise<void> {
  (await cookies()).set(JURISDICTION_COOKIE, jur, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}
