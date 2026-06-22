import { expect, test } from '@playwright/test';
import { ADMIN_STATE, CLIENT_STATE } from './global-setup';

/**
 * Gate de ROL en servidor (D-015): un usuario CLIENT no puede cargar las rutas de la firm app — el
 * middleware lo redirige al portal. Defensa además del RBAC+RLS del backend.
 *
 * Usa las sesiones reutilizadas del setup (`storageState`) en vez de hacer login por test, para no
 * agotar el rate limit de `/auth/login`.
 */
test.describe('Aislamiento de rol web→API (smoke)', () => {
  test.describe('CLIENT', () => {
    test.use({ storageState: CLIENT_STATE });

    test('un CLIENT es redirigido fuera de la firm app hacia el portal', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page, 'CLIENT no entra al panel del despacho').toHaveURL(/\/portal(\/|$)/);

      await page.goto('/clients');
      await expect(page, 'CLIENT no entra a la gestión de clientes').toHaveURL(/\/portal(\/|$)/);
    });
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
