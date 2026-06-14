import { NextResponse, type NextRequest } from 'next/server';
import type { TokenPair } from '@/lib/auth-types';
import { nestUrl, setSessionCookie } from '@/lib/server/session';

/**
 * BFF de login: proxya a Nest `POST /api/auth/login`, guarda el refresh en cookie httpOnly y devuelve
 * solo el access token al cliente (que lo mantiene en memoria). Ver D-014.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
  const pair = data as TokenPair;
  setSessionCookie(pair.refreshToken);
  return NextResponse.json({ accessToken: pair.accessToken, expiresIn: pair.expiresIn });
}
