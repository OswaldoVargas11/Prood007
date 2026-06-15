import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;

/**
 * Gate de ROL en servidor (D-015): un usuario CLIENT no puede siquiera cargar las rutas de la
 * firm app — el middleware lo redirige al portal. Defensa además del RBAC+RLS del backend.
 * `page.request` comparte el cookie jar del contexto, así que tras el login del BFF la navegación
 * va autenticada.
 */
test.describe('Aislamiento de rol web→API (smoke)', () => {
  test('un CLIENT es redirigido fuera de la firm app hacia el portal', async ({ page }) => {
    const { client } = creds();
    const login = await page.request.post('/api/auth/login', {
      data: { email: client.email, password: client.password },
    });
    expect(login.ok(), 'el cliente inicia sesión por el BFF').toBeTruthy();

    await page.goto('/dashboard');
    await expect(page, 'CLIENT no entra al panel del despacho').toHaveURL(/\/portal(\/|$)/);

    await page.goto('/clients');
    await expect(page, 'CLIENT no entra a la gestión de clientes').toHaveURL(/\/portal(\/|$)/);
  });

  test('un usuario del despacho (FIRM_ADMIN) sí accede al panel', async ({ page }) => {
    const { admin } = creds();
    const login = await page.request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.ok()).toBeTruthy();

    await page.goto('/dashboard');
    await expect(page, 'el staff permanece en el panel del despacho').toHaveURL(
      /\/dashboard(\/|$)/,
    );
  });
});
