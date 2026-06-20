import { NextResponse, type NextRequest } from 'next/server';
import type { TokenPair } from '@/lib/auth-types';
import { jurisdictionFromAccessToken, scopeFromAccessToken } from '@/lib/scope';
import {
  nestUrl,
  setJurisdictionCookie,
  setScopeCookie,
  setSessionCookie,
} from '@/lib/server/session';

/**
 * BFF del segundo paso del login con MFA: proxya a Nest `POST /api/auth/mfa/login` (token de desafío +
 * código), guarda el refresh en cookie httpOnly y devuelve solo el access token. Igual que /auth/login.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(nestUrl('/auth/mfa/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    return NextResponse.json(data ?? { message: 'No se pudo verificar el código' }, {
      status: res.status,
    });
  }
  const pair = data as TokenPair;
  await setSessionCookie(pair.refreshToken);
  await setScopeCookie(scopeFromAccessToken(pair.accessToken));
  await setJurisdictionCookie(jurisdictionFromAccessToken(pair.accessToken));
  return NextResponse.json({ accessToken: pair.accessToken, expiresIn: pair.expiresIn });
}
