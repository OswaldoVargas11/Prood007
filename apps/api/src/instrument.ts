import * as Sentry from '@sentry/nestjs';

/**
 * Inicialización de Sentry (observabilidad de errores). GATED por `SENTRY_DSN`: sin DSN el SDK queda
 * INERTE (no envía nada, no afecta a nada), igual que las demás integraciones opcionales. Con DSN,
 * captura excepciones HTTP no controladas, rechazos/errores no atrapados (incluidos los de los crons,
 * p. ej. el dunning diario o una emisión fiscal) y, si se activa el sampling, trazas de rendimiento.
 *
 * IMPORTANTE: este módulo se importa EL PRIMERO en main.ts para que la auto-instrumentación de
 * `@sentry/nestjs` envuelva el framework antes de que se cargue Nest.
 *
 * Privacidad (RGPD / datos de despachos): `sendDefaultPii: false` — NO se adjuntan cabeceras, cookies,
 * IP ni cuerpos por defecto. Subir el sampling de trazas con cuidado (puede capturar datos sensibles).
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    // Versión desplegada (opcional): ayuda a correlacionar errores con un release concreto.
    release: process.env.SENTRY_RELEASE || undefined,
    // Muestreo de trazas de rendimiento. Por defecto 0 (solo errores) para no generar coste/ruido ni
    // capturar datos sensibles sin querer. Subir conscientemente con SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
  });
}
