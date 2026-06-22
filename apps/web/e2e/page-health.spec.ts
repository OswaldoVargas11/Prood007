import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ADMIN_STATE, CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;

// Sesión FIRM_ADMIN reutilizada del setup (sin login por test → no agota el rate limit de /auth/login).
test.use({ storageState: ADMIN_STATE });

/**
 * Salud de páginas: con sesión FIRM_ADMIN, recorre todas las rutas de la firm-app y verifica que
 * ninguna dispara errores de i18n (MISSING_MESSAGE / FORMATTING_ERROR / MALFORMED_ARGUMENT, que
 * next-intl emite por console.error tanto en dev como en prod) ni respuestas 5xx.
 *
 * Guarda contra regresiones como las halladas en el QA del 2026-06-22 (BUG-I18N-01 del `AiPanel`
 * en la cabecera global y BUG-I18N-02 de las plantillas con `{{campo}}`). Requiere haber pasado el
 * muro de verificación de email (best-effort en global-setup); si no, se auto-salta.
 */
const FIRM_ROUTES = [
  'dashboard',
  'leads',
  'matters',
  'clients',
  'tasks',
  'time',
  'documents',
  'templates',
  'billing',
  'invoices',
  'messages',
  'calendar',
  'scheduling',
  'lexnet',
  'aml',
  'reports',
  'approvals',
  'audit',
  'import',
  'subscription',
  'settings',
];

const I18N_ERROR = /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|MALFORMED_ARGUMENT|IntlError/;

test.describe('Salud de páginas (FIRM_ADMIN)', () => {
  test('ninguna ruta del despacho lanza errores de i18n ni 5xx', async ({ page }) => {
    test.skip(
      !creds().verified,
      'requiere verificación de email (JWT_ACCESS_SECRET ausente en el entorno)',
    );
    test.setTimeout(150_000);

    const i18nErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && I18N_ERROR.test(msg.text())) {
        i18nErrors.push(`${page.url()} :: ${msg.text().slice(0, 160)}`);
      }
    });
    page.on('pageerror', (err) => {
      if (I18N_ERROR.test(String(err.message)))
        i18nErrors.push(`${page.url()} :: ${err.message.slice(0, 160)}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });

    for (const route of FIRM_ROUTES) {
      await page.goto(`/es/${route}`, { waitUntil: 'networkidle' });
      // Aterriza en la firm-app (no rebotado a login ni al portal).
      await expect(page, `ruta accesible: /es/${route}`).toHaveURL(
        new RegExp(`/es/${route}(/|\\?|$)`),
      );
    }

    // El `AiPanel` de la cabecera renderiza su contenido (Sheet) de forma eager en cada página, así
    // que sus claves (`ai.assistant/subtitle/soon/placeholder/citations`) se evalúan en cada carga:
    // esta comprobación ya cubre la regresión de BUG-I18N-01 sin tener que abrir el panel.
    expect(i18nErrors, `errores de i18n detectados:\n${i18nErrors.join('\n')}`).toEqual([]);
    expect(serverErrors, `respuestas 5xx detectadas:\n${serverErrors.join('\n')}`).toEqual([]);
  });
});
