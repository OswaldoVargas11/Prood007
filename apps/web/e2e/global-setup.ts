import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { request } from '@playwright/test';

/**
 * Siembra determinista para los smoke e2e: crea un tenant ES con un admin y, a través de él, un
 * cliente con acceso al portal (rol CLIENT). Persiste las credenciales en e2e/.auth/creds.json
 * para que los specs las lean. No depende de datos de dev (cada run usa identificadores únicos).
 *
 * La API se direcciona por PLAYWRIGHT_API_URL (CI) o localhost:4000 (local).
 */
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
export const CREDS_PATH = join(__dirname, '.auth', 'creds.json');

export interface SeedCreds {
  tenantId: string;
  admin: { email: string; password: string };
  client: { email: string; password: string };
}

export default async function globalSetup(): Promise<void> {
  const stamp = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const password = 'Sup3rSecret!2026';
  const adminEmail = `e2e_admin_${stamp}@despacho.test`;
  const clientEmail = `e2e_client_${stamp}@cliente.test`;

  const api = await request.newContext({ baseURL: API_URL });

  const reg = await api.post('/api/auth/register-tenant', {
    data: {
      tenantName: `E2E Despacho ${stamp}`,
      jurisdiction: 'es',
      currency: 'EUR',
      taxId: 'B12345674',
      admin: { email: adminEmail, password, fullName: 'E2E Admin' },
    },
  });
  if (!reg.ok()) throw new Error(`register-tenant failed: ${reg.status()} ${await reg.text()}`);
  const tenantId = ((await reg.json()) as { tenantId?: string; id?: string }).tenantId ?? '';

  const login = await api.post('/api/auth/login', { data: { email: adminEmail, password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()} ${await login.text()}`);
  const adminToken = ((await login.json()) as { accessToken: string }).accessToken;
  const authHeader = { Authorization: `Bearer ${adminToken}` };

  const client = await api.post('/api/clients', {
    headers: authHeader,
    data: { name: 'Cliente E2E', taxId: '12345678Z' },
  });
  if (!client.ok())
    throw new Error(`create client failed: ${client.status()} ${await client.text()}`);
  const clientId = ((await client.json()) as { id: string }).id;

  const portal = await api.post(`/api/clients/${clientId}/portal-user`, {
    headers: authHeader,
    data: { email: clientEmail, password, fullName: 'Cliente E2E' },
  });
  if (!portal.ok())
    throw new Error(`portal-user failed: ${portal.status()} ${await portal.text()}`);

  await api.dispose();

  const creds: SeedCreds = {
    tenantId,
    admin: { email: adminEmail, password },
    client: { email: clientEmail, password },
  };
  mkdirSync(dirname(CREDS_PATH), { recursive: true });
  writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
}
