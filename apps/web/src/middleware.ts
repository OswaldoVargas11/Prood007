import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const SESSION_COOKIE = 'lf_session';
const SCOPE_COOKIE = 'lf_scope';

/**
 * Middleware combinado: i18n (next-intl) + gate de autenticación y ROL, en SERVIDOR.
 *
 * - Sin cookie de sesión y fuera de /login → /login.
 * - Con sesión en /login → su home según ámbito (firm → /dashboard, client → /portal).
 * - Ámbito `client` (rol CLIENT) NO puede entrar a la firm app → /portal. Ámbito `firm` no necesita
 *   el portal → /dashboard. Esto no se puede saltar desactivando JS; el backend (RBAC + RLS) sigue
 *   siendo la verdad. Ver D-014/D-015.
 */
/** Locales legados (antes había uno por jurisdicción); ahora todo es `es`. */
const LEGACY_LOCALES = ['es-ES', 'es-DO'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const segments = pathname.split('/');

  // Redirección permanente de las URLs viejas /es-ES/* y /es-DO/* a /es/* (no rompe enlaces/marcadores).
  if (LEGACY_LOCALES.includes(segments[1] ?? '')) {
    const url = req.nextUrl.clone();
    url.pathname = '/es' + (segments.slice(2).length ? '/' + segments.slice(2).join('/') : '');
    return NextResponse.redirect(url, 308);
  }

  const maybeLocale = segments[1];
  const hasLocale = routing.locales.includes(maybeLocale as (typeof routing.locales)[number]);
  const locale = hasLocale ? maybeLocale : routing.defaultLocale;
  const rest = '/' + segments.slice(hasLocale ? 2 : 1).join('/');

  // Consola de plataforma (super-admin): auth propia (sessionStorage), NO la sesión del despacho.
  // Se salta toda la lógica de sesión/rol del despacho; solo aplica i18n.
  if (rest === '/platform' || rest.startsWith('/platform/')) {
    return intlMiddleware(req);
  }

  // Páginas legales (privacidad, términos): públicas SIEMPRE, con o sin sesión (sin redirecciones).
  if (rest === '/privacy' || rest === '/terms') {
    return intlMiddleware(req);
  }

  const hasSession = req.cookies.has(SESSION_COOKIE);
  const scope = req.cookies.get(SCOPE_COOKIE)?.value;
  const isLogin = rest === '/login' || rest.startsWith('/login/');
  const isOnboarding = rest === '/onboarding' || rest.startsWith('/onboarding/');
  // Recuperación de contraseña: accesible sin sesión (el usuario no puede entrar). Ver SEC3.
  const isRecovery =
    rest === '/forgot-password' ||
    rest.startsWith('/forgot-password/') ||
    rest === '/reset-password' ||
    rest.startsWith('/reset-password/');
  // Formulario público de captación (intake) del despacho: accesible sin sesión.
  const isIntake = rest === '/intake' || rest.startsWith('/intake/');
  const isPublic = isLogin || isOnboarding || isRecovery || isIntake;
  const isPortal = rest === '/portal' || rest.startsWith('/portal/');
  const home = scope === 'client' ? 'portal' : 'dashboard';

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/${home}`, req.url));
  }
  // Gate de rol (solo si conocemos el ámbito; si falta, el shell de cliente lo resuelve).
  if (hasSession && scope === 'client' && !isPortal) {
    return NextResponse.redirect(new URL(`/${locale}/portal`, req.url));
  }
  if (hasSession && scope === 'firm' && isPortal) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url));
  }
  return intlMiddleware(req);
}

export const config = {
  // i18n + auth a todo salvo internos de Next, BFF (/api) y estáticos.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
