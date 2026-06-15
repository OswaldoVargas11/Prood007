// Verificación REAL del webhook de Stripe (firma HMAC genuina, mismo constructEvent de producción).
// No usa mocks: firma el payload con el secreto real vía el SDK de Stripe y lo POSTea al endpoint.
// Cubre: conciliación, idempotencia ante reenvío, firma manipulada → 400, y moneda distinta → no cobra.
import Stripe from 'stripe';

// Claves SOLO desde el entorno (nunca hardcodeadas). Modo test: sk_test_… + el whsec que uses al arrancar.
//   STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… API_PORT=4002 node scripts/stripe-webhook-verify.mjs
const API = `http://localhost:${process.env.API_PORT ?? 4002}/api`;
const SECRET = process.env.STRIPE_SECRET_KEY;
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET;
if (!SECRET || !WHSEC) {
  console.error('Faltan STRIPE_SECRET_KEY y/o STRIPE_WEBHOOK_SECRET en el entorno.');
  process.exit(2);
}
const stripe = new Stripe(SECRET);

const j = (r) => r.json();
const auth = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

function signedPost(payloadObj) {
  const payload = JSON.stringify(payloadObj);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  return fetch(`${API}/payments/webhook/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
}

function event(invoiceId, tenantId, cents, { id = 'evt_x', pi = 'pi_x', currency = 'eur' } = {}) {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: { id: 'cs_x', currency, metadata: { invoiceId, tenantId }, amount_total: cents, payment_intent: pi },
    },
  };
}

const pass = [];
const fail = [];
const check = (name, cond) => (cond ? pass : fail).push(name);
// providerRef es ÚNICO global (un PaymentIntent real nunca se repite); hacemos únicos los ids por corrida.
const RUN = Date.now();

const email = `whverify_${Date.now()}@d.test`;
const reg = await j(
  await fetch(`${API}/auth/register-tenant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantName: `Despacho ${email}`,
      jurisdiction: 'es',
      currency: 'EUR',
      taxId: 'B12345674',
      admin: { email, password: 'Sup3rSecret!2026', fullName: 'Admin' },
    }),
  }),
);
const token = reg.tokens.accessToken;
const tenantId = reg.tenantId;
const client = await j(
  await fetch(`${API}/clients`, { method: 'POST', headers: auth(token), body: JSON.stringify({ name: 'Cliente', taxId: '12345678Z' }) }),
);
const matter = await j(
  await fetch(`${API}/matters`, { method: 'POST', headers: auth(token), body: JSON.stringify({ title: 'Asunto', type: 'civil', clientId: client.id }) }),
);
async function newInvoice() {
  const r = await j(
    await fetch(`${API}/ledger/invoices`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ matterId: matter.id, lines: [{ description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' }] }),
    }),
  );
  return { id: r.invoice.id, total: Number(r.invoice.total) };
}
const invStatus = async (id) => j(await fetch(`${API}/ledger/invoices/${id}`, { headers: auth(token) }));
const payments = async (id) => j(await fetch(`${API}/payments/by-invoice/${id}`, { headers: auth(token) }));

// 1) Pago firmado de verdad → concilia → PAID con un Payment STRIPE.
{
  const inv = await newInvoice();
  const res = await signedPost(event(inv.id, tenantId, inv.total * 100, { id: `evt_pay1_${RUN}`, pi: `pi_pay1_${RUN}` }));
  const got = await invStatus(inv.id);
  const ps = await payments(inv.id);
  check('firma real válida → 200', res.status === 200);
  check('factura → PAID', got.status === 'PAID');
  check('amountPaid = total', Number(got.amountPaid) === inv.total);
  check('un Payment STRIPE con providerRef', ps.length === 1 && ps[0].method === 'STRIPE' && ps[0].providerRef === `pi_pay1_${RUN}`);
}

// 2) Idempotencia: reenviar el MISMO evento firmado → no duplica.
{
  const inv = await newInvoice();
  const evt = event(inv.id, tenantId, inv.total * 100, { id: `evt_dedup_${RUN}`, pi: `pi_dedup_${RUN}` });
  await signedPost(evt);
  const r2 = await signedPost(evt);
  const ps = await payments(inv.id);
  const got = await invStatus(inv.id);
  check('reenvío → 200', r2.status === 200);
  check('idempotente: un solo Payment', ps.length === 1);
  check('idempotente: amountPaid no crece', Number(got.amountPaid) === inv.total);
}

// 3) Firma manipulada → 400, sin conciliar.
{
  const inv = await newInvoice();
  const payload = JSON.stringify(event(inv.id, tenantId, inv.total * 100, { pi: `pi_tamper_${RUN}` }));
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  // Manipula el cuerpo DESPUÉS de firmar (la firma deja de cuadrar).
  const tampered = payload.replace('Honorarios', 'HACK') + ' ';
  const res = await fetch(`${API}/payments/webhook/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: tampered,
  });
  const ps = await payments(inv.id);
  check('firma manipulada → 400', res.status === 400);
  check('manipulada: no concilió (0 Payment)', ps.length === 0);
}

// 4) Moneda distinta (USD) a la factura (EUR) → no cobra.
{
  const inv = await newInvoice();
  const res = await signedPost(event(inv.id, tenantId, inv.total * 100, { id: `evt_usd_${RUN}`, pi: `pi_usd_${RUN}`, currency: 'usd' }));
  const got = await invStatus(inv.id);
  const ps = await payments(inv.id);
  check('moneda distinta → no PAID', got.status !== 'PAID');
  check('moneda distinta → 0 Payment', ps.length === 0);
  void res;
}

console.log('\n=== RESULTADO ===');
console.log('PASS:', pass.length);
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) {
  console.log('FAIL:', fail.length);
  fail.forEach((f) => console.log('  ✗', f));
  process.exit(1);
}
console.log('\nTODOS LOS CONTROLES DEL WEBHOOK VERIFICADOS CON FIRMA REAL.');
