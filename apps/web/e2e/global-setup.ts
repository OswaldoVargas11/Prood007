import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';

/**
 * Siembra determinista para los e2e web→API. Crea, contra la API real (con cumplimiento):
 *  - un tenant ES con admin (FIRM_ADMIN) + un abogado (LAWYER) + un cliente con portal (CLIENT),
 *    un expediente y una factura emitida (Verifactu) → recorridos de despacho y portal;
 *  - un tenant DO con admin + cliente + expediente + factura (e-CF stub, DOP) → jurisdicción/moneda.
 *
 * Verificación de email best-effort: si `JWT_ACCESS_SECRET` está en el entorno (lo está en CI),
 * acuñamos el JWT `email_verify` y confirmamos por `POST /api/auth/verify-email`, desbloqueando el
 * muro. Si no, `verified=false` y los specs que necesitan pasarlo se auto-saltan.
 *
 * IMPORTANTE (rate limit): `/auth/login` está limitado a 10/min por IP. Para no agotarlo, el setup
 * hace el MÍNIMO de logins y persiste sesión reutilizable:
 *  - `storageState` del admin y del cliente (cookie de sesión del web) → los specs de UI navegan sin
 *    volver a hacer login (`test.use({ storageState })`);
 *  - access tokens (Bearer) en creds → los specs de API no hacen login.
 *
 * API por PLAYWRIGHT_API_URL (CI) o localhost:4000; web por PLAYWRIGHT_BASE_URL o localhost:3000.
 */
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';
const AUTH_DIR = join(__dirname, '.auth');
export const CREDS_PATH = join(AUTH_DIR, 'creds.json');
export const ADMIN_STATE = join(AUTH_DIR, 'admin-state.json');
export const CLIENT_STATE = join(AUTH_DIR, 'client-state.json');
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
  /** Access tokens (Bearer) emitidos en el setup, para que los specs de API no repitan login. */
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

/** Decodifica el `sub` (userId) de un access token sin verificar la firma. */
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

/** Confirma el email del usuario dueño de `accessToken` (best-effort). Devuelve si se verificó. */
async function verifyEmail(api: APIRequestContext, accessToken: string): Promise<boolean> {
  if (!JWT_SECRET) return false;
  const res = await api.post('/api/auth/verify-email', {
    data: { token: signEmailVerify(subOf(accessToken)) },
  });
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

/**
 * POST `/api/auth/login` con reintentos ante 429. `/auth/login` está limitado a 10/min por IP y entre
 * el setup y los specs varios logins comparten la misma IP en CI; un 429 esporádico no debe tumbar la
 * siembra ni el re-acuñado de sesión. Backoff fijo y acotado (la ventana del limitador es de 1 min).
 */
async function postLoginWithBackoff(
  ctx: APIRequestContext,
  email: string,
  password: string,
): Promise<Awaited<ReturnType<APIRequestContext['post']>>> {
  const delaysMs = [0, 1_000, 2_500, 5_000, 9_000, 13_000];
  let last: Awaited<ReturnType<APIRequestContext['post']>> | undefined;
  for (const delay of delaysMs) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    last = await ctx.post('/api/auth/login', { data: { email, password } });
    if (last.status() !== 429) return last;
  }
  return last as Awaited<ReturnType<APIRequestContext['post']>>;
}

/** Login por el BFF del web: fija la cookie de sesión en `ctx` y devuelve el access token. */
async function webLogin(ctx: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await postLoginWithBackoff(ctx, email, password);
  await expectOk(`web login ${email}`, res);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/**
 * Re-acuña una sesión CLIENT FRESCA por test (lazy), en vez de reusar el `CLIENT_STATE` del setup.
 *
 * Motivo (flakiness de role-isolation): el refresh token es **rotativo con detección de reutilización**
 * (apps/api tokens.service `rotate`). El `storageState` compartido guarda UN refresh `R0`; el access
 * vive en memoria, así que cada context restaurado arranca pidiendo `/api/auth/refresh`. El primer spec
 * CLIENT (portal) consume `R0` (lo rota y revoca); el siguiente que restaura el MISMO fichero presenta
 * `R0` ya revocado → la detección de reutilización dispara `revokeAllForUser` + 401 → el BFF limpia la
 * cookie → rebote a `/login`, que compite con la aserción de URL. Acuñando un login fresco por test,
 * cada sesión es válida y nadie reutiliza un token rotado (no se dispara el blast). Idempotente y barato.
 */
export async function mintClientState(): Promise<
  Awaited<ReturnType<APIRequestContext['storageState']>>
> {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;
  const ctx = await request.newContext({ baseURL: WEB_URL });
  const res = await postLoginWithBackoff(ctx, creds.client.email, creds.client.password);
  await expectOk('mint client state', res);
  const state = await ctx.storageState();
  await ctx.dispose();
  return state;
}

export default async function globalSetup(): Promise<void> {
  const stamp = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  mkdirSync(AUTH_DIR, { recursive: true });
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

  // Sesión del admin: login por el BFF (cookie → storageState) + token (login #1).
  const adminWeb = await request.newContext({ baseURL: WEB_URL });
  const adminToken = await webLogin(adminWeb, adminEmail, PASSWORD);
  verified = (await verifyEmail(api, adminToken)) && verified;
  await adminWeb.storageState({ path: ADMIN_STATE });
  await adminWeb.dispose();
  const auth = { Authorization: `Bearer ${adminToken}` };

  // Abogado (LAWYER): token vía login directo a la API (login #2).
  const lawyer = await api.post('/api/users', {
    headers: auth,
    data: { email: lawyerEmail, password: PASSWORD, fullName: 'E2E Abogada', role: 'LAWYER' },
  });
  await expectOk('create lawyer', lawyer);
  const lawyerLogin = await api.post('/api/auth/login', {
    data: { email: lawyerEmail, password: PASSWORD },
  });
  await expectOk('lawyer login', lawyerLogin);
  const lawyerToken = ((await lawyerLogin.json()) as { accessToken: string }).accessToken;
  if (verified) await verifyEmail(api, lawyerToken);

  // Cliente + expediente + factura emitida (Verifactu).
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
  // el primer acceso (`mustChangePassword`); la rotamos y capturamos la sesión ya operativa.
  const portal = await api.post(`/api/clients/${clientId}/portal-user`, {
    headers: auth,
    data: { email: clientEmail, password: PASSWORD, fullName: 'Cliente E2E' },
  });
  await expectOk('portal-user', portal);

  const clientWeb = await request.newContext({ baseURL: WEB_URL });
  const clientToken1 = await webLogin(clientWeb, clientEmail, PASSWORD); // login #3
  if (verified) await verifyEmail(api, clientToken1);
  const newClientPassword = `${PASSWORD}-2`;
  const changed = await api.post('/api/auth/change-password', {
    headers: { Authorization: `Bearer ${clientToken1}` },
    data: { currentPassword: PASSWORD, newPassword: newClientPassword },
  });
  let clientPassword = PASSWORD;
  let clientAccessToken = clientToken1;
  if (changed.ok()) {
    clientPassword = newClientPassword;
    // change-password rota la sesión: re-login con la nueva contraseña para una cookie/token frescos (login #4).
    clientAccessToken = await webLogin(clientWeb, clientEmail, newClientPassword);
  }
  await clientWeb.storageState({ path: CLIENT_STATE });
  await clientWeb.dispose();

  // ── Tenant DO (jurisdicción/moneda). Token desde la respuesta de registro (sin login). ───────────
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
  const regDoBody = (await regDo.json()) as {
    tenantId?: string;
    tokens?: { accessToken?: string };
  };
  const doTenantId = regDoBody.tenantId ?? '';
  const doToken = regDoBody.tokens?.accessToken ?? '';
  if (verified && doToken) await verifyEmail(api, doToken);
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
  writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
}
