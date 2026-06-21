import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Cabeceras de seguridad para TODA la web (la API ya las pone con helmet; el front no las tenía).
// Anti-clickjacking (frame-ancestors + X-Frame-Options), HSTS, nosniff y Referrer-Policy.
// NOTA: una CSP completa (script-src/default-src con nonce) queda como mejora a probar aparte, para no
// romper el render de Next (scripts inline de hidratación). `frame-ancestors 'none'` es seguro y cierra
// el clickjacking sin afectar al funcionamiento.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@legalflow/domain'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

const config = withNextIntl(nextConfig);

// Sentry SOLO se aplica si hay DSN en build → sin DSN, coste cero (ni plugin de build ni SDK de cliente
// en el bundle). Con DSN, envuelve para inyectar la instrumentación y (si hay SENTRY_AUTH_TOKEN +
// org/project) subir los source maps; sin esas variables no falla, solo no sube source maps.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      disableLogger: true,
      widenClientFileUpload: true,
    })
  : config;

