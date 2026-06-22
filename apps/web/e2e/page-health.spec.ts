import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;

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
    const { admin, verified } = creds();
    test.skip(
      !verified,
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

    const login = await page.request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.ok(), 'el admin inicia sesión por el BFF').toBeTruthy();

    for (const route of FIRM_ROUTES) {
      await page.goto(`/es/${route}`, { waitUntil: 'networkidle' });
      // Aterriza en la firm-app (no rebotado a login ni al portal).
      await expect(page, `ruta accesible: /es/${route}`).toHaveURL(
        new RegExp(`/es/${route}(/|\\?|$)`),
      );
    }

    expect(i18nErrors, `errores de i18n detectados:\n${i18nErrors.join('\n')}`).toEqual([]);
    expect(serverErrors, `respuestas 5xx detectadas:\n${serverErrors.join('\n')}`).toEqual([]);
  });

  test('el panel del asistente IA del header se abre sin errores de i18n', async ({ page }) => {
    const { admin, verified } = creds();
    test.skip(!verified, 'requiere verificación de email');

    const i18nErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && I18N_ERROR.test(msg.text()))
        i18nErrors.push(msg.text().slice(0, 160));
    });

    await page.request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    await page.goto('/es/dashboard', { waitUntil: 'networkidle' });

    // El diálogo modal de novedades (si aparece) deja el resto de la página en aria-hidden; ciérralo.
    await page
      .getByRole('button', { name: /Entendido/ })
      .click({ timeout: 3000 })
      .catch(() => {});

    const aiButton = page.getByRole('button', { name: /Asistente IA/ });
    await expect(
      aiButton,
      'el botón del asistente muestra texto resuelto (no la clave i18n)',
    ).toBeVisible();
    await aiButton.click();
    await expect(page.getByText(/Próximamente/)).toBeVisible();

    expect(i18nErrors, `errores de i18n al abrir el asistente:\n${i18nErrors.join('\n')}`).toEqual(
      [],
    );
  });
});
