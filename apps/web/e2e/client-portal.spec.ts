import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;
const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
const I18N_ERROR = /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|MALFORMED_ARGUMENT|IntlError/;

/**
 * Portal del cliente: el CLIENT inicia sesión, aterriza en su portal (no en la firm-app) y solo ve
 * SUS datos (el expediente y la factura sembrados para él), sin errores de i18n.
 */
test.describe('Portal del cliente (CLIENT)', () => {
  test('aterriza en el portal y ve únicamente sus expedientes y facturas', async ({ page }) => {
    const { client, esInvoice, verified } = creds();
    test.skip(!verified, 'requiere verificación de email');

    const i18nErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && I18N_ERROR.test(msg.text()))
        i18nErrors.push(msg.text().slice(0, 160));
    });

    // Login por el BFF: fija la cookie de sesión del web (para la navegación de UI) y devuelve el
    // access token en el cuerpo (las llamadas directas a la API requieren Bearer, no la cookie del web).
    const login = await page.request.post('/api/auth/login', {
      data: { email: client.email, password: client.password },
    });
    expect(login.ok(), 'el cliente inicia sesión por el BFF').toBeTruthy();
    const accessToken = ((await login.json()) as { accessToken: string }).accessToken;
    const bearer = { Authorization: `Bearer ${accessToken}` };

    await page.goto('/es/portal', { waitUntil: 'networkidle' });
    await expect(page, 'el CLIENT permanece en el portal').toHaveURL(/\/portal(\/|\?|$)/);

    // Solo ve SUS datos vía la API del portal.
    const invoices = await page.request.get(`${API}/api/portal/invoices`, { headers: bearer });
    expect(invoices.ok(), `portal/invoices: ${invoices.status()}`).toBeTruthy();
    const body = JSON.stringify(await invoices.json());
    if (esInvoice)
      expect(body, 'la factura del cliente aparece en su portal').toContain(esInvoice.number);

    const matters = await page.request.get(`${API}/api/portal/matters`, { headers: bearer });
    expect(matters.ok(), `portal/matters: ${matters.status()}`).toBeTruthy();

    expect(i18nErrors, `errores de i18n en el portal:\n${i18nErrors.join('\n')}`).toEqual([]);
  });
});
