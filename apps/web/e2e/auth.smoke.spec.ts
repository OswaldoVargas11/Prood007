import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;

test.describe('Auth web→API (smoke)', () => {
  test('login por el BFF devuelve access y fija el refresh en cookie httpOnly', async ({
    request,
  }) => {
    const { admin } = creds();
    const res = await request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as { accessToken?: string };
    expect(body.accessToken, 'el access token vuelve en el cuerpo (vive en memoria)').toBeTruthy();

    const setCookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    const session = setCookies.find((c) => c.startsWith('lf_session='));
    expect(session, 'se emite la cookie de sesión lf_session').toBeTruthy();
    expect(session!.toLowerCase(), 'la cookie de sesión es httpOnly').toContain('httponly');
  });

  test('una ruta protegida sin sesión redirige a login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('credenciales inválidas no autentican (401, sin cookie de sesión)', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'no-existe@nadie.test', password: 'incorrecta-12345' },
    });
    expect(res.status()).toBe(401);
    const setCookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    expect(setCookies.find((c) => c.startsWith('lf_session='))).toBeFalsy();
  });
});
