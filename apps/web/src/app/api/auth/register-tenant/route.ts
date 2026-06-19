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
 * BFF de alta de despacho: proxya a Nest `POST /api/auth/register-tenant`, que crea el tenant + admin
 * y devuelve `{ tenantId, tokens }` (auto-login). Guardamos el refresh en cookie httpOnly y devolvemos
 * solo el access token al cliente, igual que el login. Ver D-014.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(nestUrl('/auth/register-tenant'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    return NextResponse.json(data ?? { message: 'No se pudo crear el despacho' }, {
      status: res.status,
    });
  }
  const pair = (data as { tenantId: string; tokens: TokenPair }).tokens;
  await setSessionCookie(pair.refreshToken);
  await setScopeCookie(scopeFromAccessToken(pair.accessToken));
  await setJurisdictionCookie(jurisdictionFromAccessToken(pair.accessToken));
  return NextResponse.json({ accessToken: pair.accessToken, expiresIn: pair.expiresIn });
}
