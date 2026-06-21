import * as Sentry from '@sentry/nextjs';

/**
 * Sentry para el runtime de SERVIDOR/EDGE de Next. GATED por `NEXT_PUBLIC_SENTRY_DSN`: sin DSN queda
 * inerte (no-op). `sendDefaultPii: false` (RGPD): no adjunta cabeceras/cookies/IP/cuerpos.
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
      sendDefaultPii: false,
    });
  }
}

// Captura en Sentry los errores de los Server Components / route handlers del App Router.
export const onRequestError = Sentry.captureRequestError;
