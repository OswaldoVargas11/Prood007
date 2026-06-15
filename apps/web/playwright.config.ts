import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright web→API (smoke). Ver DECISIONS D-018.
 *
 * Cubre el cableado real web↔API de los flujos de seguridad: login por el BFF (cookie httpOnly),
 * redirección por falta de sesión y el gate de ROL en servidor (un CLIENT no entra a la firm app).
 * El flujo núcleo (caso→documento→revisión→factura) llega como suite de continuación.
 *
 * Servidores: en CI los levanta el workflow (Postgres + API :4000 + web :3000) y aquí solo se
 * conecta. En local, `reuseExistingServer` reutiliza lo que ya tengas arriba.
 */
const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Control de flakiness: SOLO aquí (e2e) se permiten reintentos, máx. 2. Unit/integración: 0.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
