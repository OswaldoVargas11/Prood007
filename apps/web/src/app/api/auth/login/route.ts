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
 * BFF de login: proxya a Nest `POST /api/auth/login`, guarda el refresh en cookie httpOnly y devuelve
 * solo el access token al cliente (que lo mantiene en memoria). Ver D-014.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Anti-CSRF: un login forzado cross-site plantaría la sesión del atacante en la víctima (fijación).
  if (isCrossOrigin(req)) {
    return NextResponse.json({ message: 'Origen no permitido' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(nestUrl('/auth/login'), {
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
  // MFA: aún no hay sesión; se devuelve el desafío para el segundo paso (sin cookies).
  if (data && (data as { mfaRequired?: boolean }).mfaRequired) {
    return NextResponse.json(data);
  }
  const pair = data as TokenPair;
  await setSessionCookie(pair.refreshToken);
  await setScopeCookie(scopeFromAccessToken(pair.accessToken));
  await setJurisdictionCookie(jurisdictionFromAccessToken(pair.accessToken));
  return NextResponse.json({ accessToken: pair.accessToken, expiresIn: pair.expiresIn });
}
