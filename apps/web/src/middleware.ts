import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const SESSION_COOKIE = 'lf_session';

/**
 * Middleware combinado: i18n (next-intl) + gate de autenticación.
 *
 * - Sin cookie de sesión y fuera de /login → redirige a /login.
 * - Con cookie de sesión y en /login → redirige a /dashboard.
 * El gate por ROL (CLIENT → solo portal) se hace en el shell con los datos de /me: el middleware
 * solo ve la cookie httpOnly opaca, no el rol. Ver D-014.
 */
export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const segments = pathname.split('/');
  const maybeLocale = segments[1];
  const locale = routing.locales.includes(maybeLocale as (typeof routing.locales)[number])
    ? maybeLocale
    : routing.defaultLocale;
  const rest =
    '/' + segments.slice(routing.locales.includes(maybeLocale as never) ? 2 : 1).join('/');

  const hasSession = req.cookies.has(SESSION_COOKIE);
  const isLogin = rest === '/login' || rest.startsWith('/login/');

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url));
  }
  return intlMiddleware(req);
}

export const config = {
  // i18n + auth a todo salvo internos de Next, BFF (/api) y estáticos.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
