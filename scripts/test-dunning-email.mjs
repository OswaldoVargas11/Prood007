// Prueba end-to-end del canal EMAIL del dunning vía Brevo.
// Crea (en el tenant del admin indicado) un cliente con el email destino, un expediente y una
// factura YA VENCIDA e impaga; luego corre el barrido de dunning. Requiere que exista una
// DunningRule con channel=EMAIL para el tenant (se inserta aparte por psql).
//   node scripts/test-dunning-email.mjs
const API = process.env.API ?? 'http://localhost:4000/api';
const ADMIN_EMAIL = 'oswaldovargasrodriguez11@gmail.com';
const ADMIN_PASS = 'Pru3baEmail!2026';
const CLIENT_EMAIL = 'oswaldovargasrodriguez11@gmail.com';

let token = '';
async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

function daysAgoISO(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const login = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
token = login.accessToken ?? login.access_token ?? login.tokens?.accessToken;
console.log('✓ login OK; token:', token ? 'sí' : 'NO', '· tenantId:', login.user?.tenantId ?? '(ver /auth/me)');

const me = await call('GET', '/auth/me');
console.log('  tenantId:', me.tenantId, '· userId:', me.id);

const client = await call('POST', '/clients', {
  name: 'Cliente Prueba Dunning',
  taxId: '12345678Z',
  email: CLIENT_EMAIL,
  phone: '+34600000000',
});
console.log('✓ cliente creado:', client.id, '· email:', client.email);

const matter = await call('POST', '/matters', {
  title: 'Expediente Prueba Dunning',
  type: 'civil',
  clientId: client.id,
});
console.log('✓ expediente creado:', matter.id, matter.reference ?? '');

// Factura emitida hace 60 días con vencimiento hace 45 → claramente vencida e impaga.
const inv = await call('POST', '/ledger/invoices', {
  matterId: matter.id,
  issueDate: daysAgoISO(60),
  dueDate: daysAgoISO(45),
  withholdingTaxCode: 'IRPF_GENERAL',
  lines: [
    {
      description: 'Honorarios profesionales (prueba dunning)',
      quantity: '1',
      unitPrice: '1000.00',
      taxCode: 'IVA_STANDARD',
    },
  ],
});
const invoice = inv.invoice ?? inv;
console.log('✓ factura creada:', invoice.number ?? invoice.id, '· total:', invoice.total, invoice.currency, '· dueDate:', invoice.dueDate, '· status:', invoice.status);

console.log('\n=== Corriendo dunning (POST /dunning/run) ===');
const run = await call('POST', '/dunning/run');
console.log('Resultado del barrido:', JSON.stringify(run));

console.log('\n=== Recordatorios de esta factura ===');
const reminders = await call('GET', `/dunning/reminders?invoiceId=${invoice.id}`);
console.log(JSON.stringify(reminders, null, 2));

console.log('\n(tenantId para insertar la DunningRule EMAIL:', me.tenantId, ')');
