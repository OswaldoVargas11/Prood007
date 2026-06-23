import { NextResponse, type NextRequest } from 'next/server';
import type { TokenPair } from '@/lib/auth-types';
import { jurisdictionFromAccessToken, scopeFromAccessToken } from '@/lib/scope';
import {
  isCrossOrigin,
  nestUrl,
  setJurisdictionCookie,
  setScopeCookie,
  setSessionCookie,
} from '@/lib/server/session';

/**
 * BFF del login social: canjea el ticket de un solo uso en Nest `POST /api/auth/social/exchange`.
 * Si el usuario tiene MFA, devuelve el desafío (sin cookies). Si no, guarda el refresh en cookie httpOnly
 * y devuelve el access token. Igual que /auth/login.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (isCrossOrigin(req)) {
    return NextResponse.json({ message: 'Origen no permitido' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(nestUrl('/auth/social/exchange'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    return NextResponse.json(data ?? { message: 'No se pudo iniciar sesión' }, {
      status: res.status,
    });
  }
  if (data && (data as { mfaRequired?: boolean }).mfaRequired) {
    return NextResponse.json(data);
  }
  const pair = data as TokenPair;
  await setSessionCookie(pair.refreshToken);
  await setScopeCookie(scopeFromAccessToken(pair.accessToken));
  await setJurisdictionCookie(jurisdictionFromAccessToken(pair.accessToken));
  return NextResponse.json({ accessToken: pair.accessToken, expiresIn: pair.expiresIn });
}
