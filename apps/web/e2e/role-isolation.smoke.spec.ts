import { expect, test } from '@playwright/test';
import { ADMIN_STATE, mintClientState } from './global-setup';

/**
 * Gate de ROL en servidor (D-015): un usuario CLIENT no puede cargar las rutas de la firm app — el
 * middleware lo redirige al portal. Defensa además del RBAC+RLS del backend.
 *
 * El FIRM_ADMIN reutiliza el `storageState` del setup (su sesión no la muta ningún otro spec). El
 * CLIENT, en cambio, RE-ACUÑA su sesión por test (`mintClientState`) en un context propio: el refresh
 * token es rotativo con detección de reutilización (apps/api tokens.service `rotate`). Reusar el
 * `CLIENT_STATE` compartido —ya rotado/revocado por el spec del portal— hacía que el bootstrap del
 * portal presentara un token revocado → `revokeAllForUser` + 401 → el BFF limpia la cookie → rebote a
 * `/login`, que competía con la aserción de URL (flaky). Una sesión fresca por test (y por reintento)
 * es siempre válida y nadie reutiliza un token rotado, así que el blast nunca se dispara.
 */
test.describe('Aislamiento de rol web→API (smoke)', () => {
  test('un CLIENT es redirigido fuera de la firm app hacia el portal', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ storageState: await mintClientState(), baseURL });
    try {
      const page = await context.newPage();
      await page.goto('/dashboard');
      await expect(page, 'CLIENT no entra al panel del despacho').toHaveURL(/\/portal(\/|$)/);

      await page.goto('/clients');
      await expect(page, 'CLIENT no entra a la gestión de clientes').toHaveURL(/\/portal(\/|$)/);
    } finally {
      await context.close();
    }
  });

  test.describe('FIRM_ADMIN', () => {
    test.use({ storageState: ADMIN_STATE });

    test('un usuario del despacho (FIRM_ADMIN) sí accede al panel', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page, 'el staff permanece en el panel del despacho').toHaveURL(
        /\/dashboard(\/|$)/,
      );
    });
  });
});
