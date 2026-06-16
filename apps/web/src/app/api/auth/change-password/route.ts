import { NextResponse, type NextRequest } from 'next/server';
import type { TokenPair } from '@/lib/auth-types';
import { scopeFromAccessToken } from '@/lib/scope';
import { nestUrl, setScopeCookie, setSessionCookie } from '@/lib/server/session';

/**
 * BFF de cambio de contraseña. El access token vive en memoria del cliente, así que llega en el
 * header `Authorization`; lo reenviamos a Nest. El cambio CIERRA el resto de sesiones y devuelve un
 * par nuevo: reescribimos la cookie httpOnly del refresh con el nuevo (si no, el viejo quedaría
 * revocado y el siguiente refresh fallaría) y devolvemos el nuevo access al cliente. Ver D-014.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    return NextResponse.json({ message: 'No autenticado' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(nestUrl('/auth/change-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    return NextResponse.json(data ?? { message: 'No se pudo cambiar la contraseña' }, {
      status: res.status,
    });
  }
  const pair = data as TokenPair;
  await setSessionCookie(pair.refreshToken);
  await setScopeCookie(scopeFromAccessToken(pair.accessToken));
  return NextResponse.json({ accessToken: pair.accessToken, expiresIn: pair.expiresIn });
}
