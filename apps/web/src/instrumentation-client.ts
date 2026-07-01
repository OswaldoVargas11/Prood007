/**
 * Sentry en el NAVEGADOR (errores de cliente). GATED por `NEXT_PUBLIC_SENTRY_DSN` (build-time): si no
 * está, este `if` queda en código muerto y el import dinámico se elimina → `@sentry/nextjs` NO entra en
 * el bundle de cliente (coste cero cuando está apagado). Para activarlo hay que pasar el DSN como
 * build-arg al construir la imagen (ver docs/setup/SENTRY_SETUP.md). Session Replay off (privacidad/coste). PII off.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
    });
  });
}
