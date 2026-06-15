import { NextResponse } from 'next/server';
import type { TokenPair } from '@/lib/auth-types';
import { scopeFromAccessToken } from '@/lib/scope';
import {
  clearSessionCookie,
  getSessionToken,
  nestUrl,
  setScopeCookie,
  setSessionCookie,
} from '@/lib/server/session';

/**
 * BFF de refresh: usa la cookie httpOnly para pedir a Nest un par nuevo (rotación), reescribe la
 * cookie con el nuevo refresh y devuelve el nuevo access. Si falla, limpia la cookie. Ver D-014.
 */
export async function POST(): Promise<NextResponse> {
  const refreshToken = await getSessionToken();
  if (!refreshToken) {
    return NextResponse.json({ message: 'Sin sesión' }, { status: 401 });
  }
  const res = await fetch(nestUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    await clearSessionCookie();
    return NextResponse.json(data ?? { message: 'Sesión expirada' }, { status: 401 });
  }
  const pair = data as TokenPair;
  await setSessionCookie(pair.refreshToken);
  await setScopeCookie(scopeFromAccessToken(pair.accessToken));
  return NextResponse.json({ accessToken: pair.accessToken, expiresIn: pair.expiresIn });
}
