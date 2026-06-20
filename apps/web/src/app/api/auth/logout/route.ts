import { NextResponse } from 'next/server';
import { clearSessionCookie, getSessionToken, isCrossOrigin, nestUrl } from '@/lib/server/session';

/**
 * BFF de logout: revoca el refresh en Nest (best-effort) y limpia la cookie httpOnly. Ver D-014.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (isCrossOrigin(req)) {
    return NextResponse.json({ message: 'Origen no permitido' }, { status: 403 });
  }
  const refreshToken = await getSessionToken();
  if (refreshToken) {
    await fetch(nestUrl('/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  await clearSessionCookie();
  return new NextResponse(null, { status: 204 });
}
