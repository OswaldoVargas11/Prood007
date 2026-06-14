import { NextResponse } from 'next/server';
import { clearSessionCookie, getSessionToken, nestUrl } from '@/lib/server/session';

/**
 * BFF de logout: revoca el refresh en Nest (best-effort) y limpia la cookie httpOnly. Ver D-014.
 */
export async function POST(): Promise<NextResponse> {
  const refreshToken = getSessionToken();
  if (refreshToken) {
    await fetch(nestUrl('/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  clearSessionCookie();
  return new NextResponse(null, { status: 204 });
}
