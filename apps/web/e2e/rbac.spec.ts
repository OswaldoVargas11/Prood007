import { readFileSync } from 'node:fs';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;
const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';

async function status(req: APIRequestContext, path: string, tok?: string): Promise<number> {
  const res = await req.get(
    `${API}${path}`,
    tok ? { headers: { Authorization: `Bearer ${tok}` } } : {},
  );
  return res.status();
}

/**
 * RBAC en servidor (defensa real, además del gate de ruta en el middleware web). Confirma que:
 *  - un CLIENT no alcanza ninguna ruta de despacho (403) y sí su portal (200);
 *  - un LAWYER no alcanza funciones de admin (audit, usuarios, informes, ajustes) → 403;
 *  - sin sesión todo protegido devuelve 401.
 */
test.describe('RBAC web→API', () => {
  const FIRM = [
    '/api/clients',
    '/api/matters',
    '/api/ledger/invoices',
    '/api/tasks',
    '/api/dashboard/summary',
  ];
  const ADMIN_ONLY = [
    '/api/audit',
    '/api/users',
    '/api/settings',
    '/api/reports/profitability',
    '/api/users/seats',
  ];
  const PORTAL = ['/api/portal/matters', '/api/portal/invoices', '/api/portal/me'];

  test('CLIENT: 403 en rutas de despacho, 200 en su portal', async ({ request }) => {
    const tok = creds().tokens.client;
    for (const p of FIRM) expect(await status(request, p, tok), `client ${p}`).toBe(403);
    for (const p of PORTAL) expect(await status(request, p, tok), `client ${p}`).toBe(200);
  });

  test('LAWYER: 200 en rutas de despacho comunes, 403 en funciones de admin', async ({
    request,
  }) => {
    const tok = creds().tokens.lawyer;
    for (const p of FIRM) expect(await status(request, p, tok), `lawyer ${p}`).toBe(200);
    for (const p of ADMIN_ONLY) expect(await status(request, p, tok), `lawyer ${p}`).toBe(403);
  });

  test('sin sesión: 401 en rutas protegidas; el portal del cliente no es alcanzable por el staff', async ({
    request,
  }) => {
    for (const p of [...FIRM, ...ADMIN_ONLY, ...PORTAL]) {
      expect(await status(request, p), `noauth ${p}`).toBe(401);
    }
    const tok = creds().tokens.admin;
    for (const p of PORTAL)
      expect(await status(request, p, tok), `admin no entra al portal ${p}`).toBe(403);
  });
});
