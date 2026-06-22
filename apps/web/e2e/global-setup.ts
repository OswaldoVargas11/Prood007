import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';

/**
 * Siembra determinista para los e2e web→API. Crea, contra la API real (con cumplimiento):
 *  - un tenant ES con admin (FIRM_ADMIN) + un abogado (LAWYER) + un cliente con portal (CLIENT),
 *    un expediente y una factura emitida (Verifactu) → recorridos de despacho y portal;
 *  - un tenant DO con admin + cliente + expediente + factura (e-CF stub, DOP) → jurisdicción/moneda.
 *
 * La verificación de email es best-effort: si `JWT_ACCESS_SECRET` está en el entorno (lo está en CI),
 * acuñamos el JWT `email_verify` y confirmamos por el endpoint real `POST /api/auth/verify-email`,
 * desbloqueando el muro de confirmación. Si no, `verified=false` y los specs que necesitan pasar el
 * muro se auto-saltan. Cada run usa identificadores únicos (no depende de datos de dev).
 *
 * API por PLAYWRIGHT_API_URL (CI) o localhost:4000 (local). Credenciales en e2e/.auth/creds.json.
 */
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';
export const CREDS_PATH = join(__dirname, '.auth', 'creds.json');
const PASSWORD = 'Sup3rSecret!2026';

export interface SeededInvoice {
  number: string;
  currency: string;
  complianceFormat: string | null;
  ecfStatus: string | null;
}
export interface SeedCreds {
  /** Indica si la verificación de email se pudo completar (requiere JWT_ACCESS_SECRET en entorno). */
  verified: boolean;
  /**
   * Access tokens (Bearer) ya emitidos en el setup, para que los specs de API reutilicen sesión sin
   * volver a hacer login (evita rozar el límite de 20 logins/min por IP del endpoint /auth/login).
   */
  tokens: { admin: string; lawyer: string; client: string; doAdmin: string };
  // — Tenant ES —
  tenantId: string;
  admin: { email: string; password: string };
  lawyer: { email: string; password: string };
  client: { email: string; password: string };
  esMatterId: string;
  esInvoice: SeededInvoice | null;
  // — Tenant DO —
  doTenantId: string;
  doAdmin: { email: string; password: string };
  doInvoice: SeededInvoice | null;
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Firma un JWT HS256 mínimo (sin dependencias) — solo para acuñar el token de verificación. */
function signEmailVerify(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: userId, typ: 'email_verify', iat: now, exp: now + 86400 })}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Decodifica el `sub` (userId) del access token sin verificar la firma. */
function subOf(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
  return payload.sub as string;
}

async function expectOk(
  label: string,
  res: { ok(): boolean; status(): number; text(): Promise<string> },
) {
  if (!res.ok()) throw new Error(`${label} failed: ${res.status()} ${await res.text()}`);
}

async function loginToken(api: APIRequestContext, email: string): Promise<string> {
  const res = await api.post('/api/auth/login', { data: { email, password: PASSWORD } });
  await expectOk(`login ${email}`, res);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Confirma el email del usuario dueño de `accessToken` (best-effort). Devuelve si se verificó. */
async function verifyEmail(api: APIRequestContext, accessToken: string): Promise<boolean> {
  if (!JWT_SECRET) return false;
  const token = signEmailVerify(subOf(accessToken));
  const res = await api.post('/api/auth/verify-email', { data: { token } });
  return res.ok();
}

function invoiceOf(body: unknown): SeededInvoice | null {
  const inv =
    (body as { invoice?: Record<string, unknown> }).invoice ?? (body as Record<string, unknown>);
  if (!inv || !inv.number) return null;
  return {
    number: String(inv.number),
    currency: String(inv.currency ?? ''),
    complianceFormat: (inv.complianceFormat as string) ?? null,
    ecfStatus: (inv.ecfStatus as string) ?? null,
  };
}

export default async function globalSetup(): Promise<void> {
  const stamp = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const api = await request.newContext({ baseURL: API_URL });
  let verified = true;

  // ── Tenant ES ──────────────────────────────────────────────────────────────
  const adminEmail = `e2e_admin_${stamp}@despacho.test`;
  const lawyerEmail = `e2e_lawyer_${stamp}@despacho.test`;
  const clientEmail = `e2e_client_${stamp}@cliente.test`;

  const regEs = await api.post('/api/auth/register-tenant', {
    data: {
      tenantName: `E2E Despacho ${stamp}`,
      jurisdiction: 'es',
      currency: 'EUR',
      taxId: 'B12345674',
      admin: { email: adminEmail, password: PASSWORD, fullName: 'E2E Admin' },
    },
  });
  await expectOk('register-tenant ES', regEs);
  const tenantId = ((await regEs.json()) as { tenantId?: string }).tenantId ?? '';

  const adminToken = await loginToken(api, adminEmail);
  verified = (await verifyEmail(api, adminToken)) && verified;
  const auth = { Authorization: `Bearer ${adminToken}` };

  // Abogado (LAWYER)
  const lawyer = await api.post('/api/users', {
    headers: auth,
    data: { email: lawyerEmail, password: PASSWORD, fullName: 'E2E Abogada', role: 'LAWYER' },
  });
  await expectOk('create lawyer', lawyer);
  const lawyerToken = await loginToken(api, lawyerEmail);
  if (verified) await verifyEmail(api, lawyerToken);

  // Cliente + expediente + factura emitida (Verifactu)
  const clientRes = await api.post('/api/clients', {
    headers: auth,
    data: { name: 'Cliente E2E', taxId: '12345678Z' },
  });
  await expectOk('create client', clientRes);
  const clientId = ((await clientRes.json()) as { id: string }).id;

  const matterRes = await api.post('/api/matters', {
    headers: auth,
    data: { title: 'Asunto E2E', clientId, type: 'Civil' },
  });
  await expectOk('create matter', matterRes);
  const matterBody = (await matterRes.json()) as { id?: string; matter?: { id: string } };
  const esMatterId = matterBody.id ?? matterBody.matter?.id ?? '';

  const esInvRes = await api.post('/api/ledger/invoices', {
    headers: auth,
    data: {
      matterId: esMatterId,
      issueDate: '2026-06-22T00:00:00.000Z',
      withholdingTaxCode: 'IRPF_GENERAL',
      lines: [
        {
          description: 'Honorarios E2E',
          quantity: '1',
          unitPrice: '100.00',
          taxCode: 'IVA_STANDARD',
        },
      ],
    },
  });
  await expectOk('issue ES invoice', esInvRes);
  const esInvoice = invoiceOf(await esInvRes.json());

  // Portal del cliente (CLIENT). El portal obliga a cambiar la contraseña asignada por el admin en
  // el primer acceso (`mustChangePassword`), así que la rotamos para dejar la cuenta operativa.
  const portal = await api.post(`/api/clients/${clientId}/portal-user`, {
    headers: auth,
    data: { email: clientEmail, password: PASSWORD, fullName: 'Cliente E2E' },
  });
  await expectOk('portal-user', portal);
  let clientPassword = PASSWORD;
  const clientToken = await loginToken(api, clientEmail);
  if (verified) await verifyEmail(api, clientToken);
  const newClientPassword = `${PASSWORD}-2`;
  const changed = await api.post('/api/auth/change-password', {
    headers: { Authorization: `Bearer ${clientToken}` },
    data: { currentPassword: PASSWORD, newPassword: newClientPassword },
  });
  // change-password rota la sesión: usa el token nuevo que devuelve (el anterior puede quedar revocado).
  let clientAccessToken = clientToken;
  if (changed.ok()) {
    clientPassword = newClientPassword;
    clientAccessToken =
      ((await changed.json()) as { accessToken?: string }).accessToken ?? clientToken;
  }

  // ── Tenant DO (jurisdicción/moneda) ──────────────────────────────────────────
  const doAdminEmail = `e2e_admin_do_${stamp}@despacho.test`;
  const regDo = await api.post('/api/auth/register-tenant', {
    data: {
      tenantName: `E2E Despacho RD ${stamp}`,
      jurisdiction: 'do',
      currency: 'DOP',
      taxId: '101023122',
      admin: { email: doAdminEmail, password: PASSWORD, fullName: 'E2E Admin RD' },
    },
  });
  await expectOk('register-tenant DO', regDo);
  const doTenantId = ((await regDo.json()) as { tenantId?: string }).tenantId ?? '';

  const doToken = await loginToken(api, doAdminEmail);
  if (verified) await verifyEmail(api, doToken);
  const doAuth = { Authorization: `Bearer ${doToken}` };

  const doClient = await api.post('/api/clients', {
    headers: doAuth,
    data: { name: 'Cliente RD', taxId: '101023122' },
  });
  await expectOk('create DO client', doClient);
  const doClientId = ((await doClient.json()) as { id: string }).id;
  const doMatter = await api.post('/api/matters', {
    headers: doAuth,
    data: { title: 'Asunto RD', clientId: doClientId, type: 'Civil' },
  });
  await expectOk('create DO matter', doMatter);
  const doMatterBody = (await doMatter.json()) as { id?: string; matter?: { id: string } };
  const doMatterId = doMatterBody.id ?? doMatterBody.matter?.id ?? '';

  const doInvRes = await api.post('/api/ledger/invoices', {
    headers: doAuth,
    data: {
      matterId: doMatterId,
      issueDate: '2026-06-22T00:00:00.000Z',
      lines: [
        {
          description: 'Servicios RD',
          quantity: '1',
          unitPrice: '1000.00',
          taxCode: 'ITBIS_STANDARD',
        },
      ],
    },
  });
  await expectOk('issue DO invoice', doInvRes);
  const doInvoice = invoiceOf(await doInvRes.json());

  await api.dispose();

  const creds: SeedCreds = {
    verified,
    tokens: { admin: adminToken, lawyer: lawyerToken, client: clientAccessToken, doAdmin: doToken },
    tenantId,
    admin: { email: adminEmail, password: PASSWORD },
    lawyer: { email: lawyerEmail, password: PASSWORD },
    client: { email: clientEmail, password: clientPassword },
    esMatterId,
    esInvoice,
    doTenantId,
    doAdmin: { email: doAdminEmail, password: PASSWORD },
    doInvoice,
  };
  mkdirSync(dirname(CREDS_PATH), { recursive: true });
  writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
}
