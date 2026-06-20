/**
 * SEED + RESET de las 3 firmas de DEMO para ventas (idempotente).
 *
 * Crea tres despachos realistas, uno por escenario, con clientes/expedientes/provisiones/tiempo/
 * facturas YA cargados y emitidos contra la API REAL (cumplimiento Verifactu/e-CF de verdad):
 *   1) ES puro  — Bufete García & Asociados (Madrid)      · es · EUR · Verifactu/AEAT
 *   2) DO puro  — Pérez & Asociados, S.R.L. (Sto. Domingo) · do · DOP · e-CF/DGII
 *   3) DUAL     — Lex Caribe Abogados (ES + RD)            · factura en AMBOS formatos
 *
 * Es IDEMPOTENTE: en cada ejecución BORRA las tres firmas demo (por el email del admin) y las
 * recrea limpias → úsalo como RESET antes de cada llamada de ventas. Deja la suscripción en ACTIVE
 * para que el muro de prueba NUNCA aparezca en la demo.
 *
 * Uso:
 *   node apps/api/scripts/seed-demo-firms.mjs            # reset + seed (lo normal)
 *   node apps/api/scripts/seed-demo-firms.mjs --wipe     # solo borrar las demos
 *
 * Entorno: SEED_API (def. https://api.lawzora.com/api) · SYSTEM_DATABASE_URL (de .env.production).
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

// ── Entorno ──────────────────────────────────────────────────────────────────
function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv(new URL('../.env.production', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
loadEnv(new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const API = process.env.SEED_API ?? 'https://api.lawzora.com/api';
const PASSWORD = 'Lawzora.Demo-2026!'; // fuerte y única (pasa HIBP); común a las 3 demos
const WIPE_ONLY = process.argv.includes('--wipe');
const dbUrl =
  process.env.SYSTEM_DATABASE_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ── Generadores de identificadores fiscales VÁLIDOS (con dígito de control) ───
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const nif = (n) => {
  const num = String(n).padStart(8, '0').slice(0, 8);
  return num + NIF_LETTERS[Number(num) % 23];
};
function cif(seed) {
  const d = String(seed).padStart(7, '0').slice(0, 7);
  let odd = 0,
    even = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(d[i]);
    if (i % 2 === 0) {
      const x = n * 2;
      odd += x > 9 ? Math.floor(x / 10) + (x % 10) : x;
    } else even += n;
  }
  const unit = (odd + even) % 10;
  return 'B' + d + (unit === 0 ? 0 : 10 - unit); // B = S.L. → control dígito
}
const RNC_W = [7, 9, 8, 6, 5, 4, 3, 2];
function rnc(seed) {
  const d = String(seed).padStart(8, '0').slice(0, 8);
  let s = 0;
  for (let i = 0; i < 8; i++) s += Number(d[i]) * RNC_W[i];
  const m = s % 11;
  return d + String(m === 0 ? 2 : m === 1 ? 1 : 11 - m);
}
function cedula(seed) {
  const d = String(seed).padStart(10, '0').slice(0, 10);
  let s = 0;
  for (let i = 0; i < 10; i++) {
    let p = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (p > 9) p -= 9;
    s += p;
  }
  return d + String((10 - (s % 10)) % 10);
}

// ── Cliente API ──────────────────────────────────────────────────────────────
let token = '';
async function call(method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 160)}`);
  }
  return res.status === 204 ? null : res.json();
}
const isoMonthsAgo = (m, day = 10) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
};
const pick = (a, i) => a[i % a.length];

// ── Catálogos de datos realistas ─────────────────────────────────────────────
const ES_FIRST = ['María', 'Juan', 'Lucía', 'Carlos', 'Ana', 'Javier'];
const ES_LAST = ['García', 'Fernández', 'López', 'Martín', 'Sánchez', 'Romero'];
const ES_CO = ['Construcciones Delta S.L.', 'Inversiones Mediterráneo S.A.', 'Logística Ibérica S.L.'];
const ES_TYPES = ['Civil', 'Mercantil', 'Laboral', 'Penal', 'Familia'];
const ES_MATTERS = [
  'Incumplimiento contractual — suministro',
  'Despido improcedente',
  'Reclamación de cantidad',
  'Constitución de sociedad',
  'Arrendamiento de local comercial',
  'Recurso de apelación civil',
];
const DO_FIRST = ['José', 'Carmen', 'Rafael', 'Altagracia', 'Francisco', 'Yuderka'];
const DO_LAST = ['Peña', 'Jiménez', 'Reyes', 'Santos', 'Mejía', 'Polanco'];
const DO_CO = ['Inmobiliaria Caribe SRL', 'Distribuidora Quisqueya SRL', 'Servicios Antillas SRL'];
const DO_TYPES = ['Civil', 'Comercial', 'Laboral', 'Inmobiliario', 'Familia'];
const DO_MATTERS = [
  'Cobro de pesos — pagaré',
  'Desalojo por falta de pago',
  'Conflicto laboral — prestaciones',
  'Constitución de SRL',
  'Litis sobre derechos registrados',
  'Demanda en daños y perjuicios',
];

// Generador de un cliente según el "tipo de país"
function esClient(i) {
  const company = i >= 3;
  return company
    ? { name: pick(ES_CO, i), taxId: cif(2000000 + i * 137911) }
    : {
        name: `${pick(ES_FIRST, i)} ${pick(ES_LAST, i)} ${pick(ES_LAST, i + 2)}`,
        taxId: nif(11111111 + i * 2345671),
      };
}
function doClient(i) {
  const company = i >= 3;
  return company
    ? { name: pick(DO_CO, i), taxId: rnc(13000000 + i * 111317) }
    : {
        name: `${pick(DO_FIRST, i)} ${pick(DO_LAST, i)} ${pick(DO_LAST, i + 2)}`,
        taxId: cedula(40200000000 + i * 1234567),
      };
}

// ── Borrado idempotente de las firmas demo ───────────────────────────────────
const FIRMS = [
  { key: 'es', email: 'es@demo.lawzora', name: 'Bufete García & Asociados' },
  { key: 'do', email: 'do@demo.lawzora', name: 'Pérez & Asociados, S.R.L.' },
  { key: 'dual', email: 'dual@demo.lawzora', name: 'Lex Caribe Abogados' },
];
async function wipe() {
  const emails = FIRMS.map((f) => f.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { tenantId: true },
  });
  const tenantIds = [...new Set(users.map((u) => u.tenantId))];
  for (const id of tenantIds) {
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
  }
  console.log(`· Borradas ${tenantIds.length} firma(s) demo previas.`);
}

// ── Siembra de UNA firma ─────────────────────────────────────────────────────
async function seedFirm(firm) {
  console.log(`\n=== ${firm.label} ===`);
  await call('POST', '/auth/register-tenant', {
    tenantName: firm.name,
    jurisdiction: firm.jurisdiction,
    currency: firm.currency,
    taxId: firm.taxId,
    admin: { email: firm.email, password: PASSWORD, fullName: firm.adminName },
  });
  token = (await call('POST', '/auth/login', { email: firm.email, password: PASSWORD })).accessToken;

  // Clientes
  const clients = [];
  for (let i = 0; i < firm.clients.length; i++) {
    const c = firm.clients[i];
    clients.push(
      await call('POST', '/clients', {
        name: c.name,
        taxId: c.taxId,
        email: `cliente${i + 1}@${firm.key}.demo`,
        phone: firm.phone(i),
        address: firm.address(i),
      }),
    );
  }

  // Expedientes + actividad + facturas
  let issued = 0;
  for (let i = 0; i < firm.matters; i++) {
    const client = pick(clients, i);
    // Cada expediente factura según su "perfil" (es/do): formato, moneda e impuestos coherentes.
    const profile = firm.profileFor(i, client);
    const matter = await call('POST', '/matters', {
      title: pick(profile.titles, i),
      type: pick(profile.types, i),
      clientId: client.id,
    });

    // Provisión (un par por firma) + tiempo
    if (i < 2) {
      await call('POST', '/retainer/deposit', {
        matterId: matter.id,
        amount: profile.provision,
        kind: 'GENERICO',
        currency: profile.currency,
        note: 'Provisión de fondos inicial',
      }).catch(() => {});
    }
    await call('POST', '/ledger/time', {
      matterId: matter.id,
      description: 'Estudio del asunto y primera reunión',
      minutes: 60 + i * 20,
      hourlyRate: profile.rate,
      workedAt: isoMonthsAgo(1),
    }).catch(() => {});

    // Tarea con plazo procesal (1) + tarea normal (1)
    await call('POST', '/tasks/from-deadline', {
      deadlineType: profile.deadline,
      startDate: isoMonthsAgo(0),
      days: 10 + i,
      matterId: matter.id,
    }).catch(() => {});

    // Factura emitida (repartidas en 6 meses para el gráfico)
    const inv = await call('POST', '/ledger/invoices', {
      matterId: matter.id,
      issueDate: isoMonthsAgo(i % 6),
      invoiceFormat: profile.format,
      currency: profile.currency,
      withholdingTaxCode: profile.withholding,
      lines: [
        {
          description: 'Honorarios profesionales',
          quantity: '1',
          unitPrice: profile.fee,
          taxCode: profile.taxCode,
        },
      ],
    });
    issued++;
    // Algunas pagadas (pares recientes); las viejas impagadas quedan VENCIDAS solas.
    if (i % 3 === 0) await call('POST', `/ledger/invoices/${inv.invoice.id}/pay`).catch(() => {});
  }

  // Prospectos del embudo (CRM): varios por fase y origen, para que la captación no salga vacía.
  const STAGES = [
    { source: 'intake', status: 'NEW' },
    { source: 'manual', status: 'NEW' },
    { source: 'intake', status: 'CONTACTED' },
    { source: 'manual', status: 'QUALIFIED' },
    { source: 'intake', status: 'LOST' },
  ];
  let leads = 0;
  for (let i = 0; i < STAGES.length; i++) {
    const st = STAGES[i];
    const lead = await call('POST', '/leads', {
      name: firm.leadPeople[i % firm.leadPeople.length],
      email: `prospecto${i + 1}@${firm.key}.demo`,
      phone: firm.phone(i),
      subject: firm.leadSubjects[i % firm.leadSubjects.length],
      source: st.source,
    }).catch(() => null);
    if (lead && st.status !== 'NEW')
      await call('PATCH', `/leads/${lead.id}`, { status: st.status }).catch(() => {});
    if (lead) leads++;
  }

  // Suscripción ACTIVE (sin muro en la demo)
  const me = await prisma.user.findFirst({
    where: { email: firm.email },
    select: { tenantId: true },
  });
  if (me)
    await prisma.tenant.update({
      where: { id: me.tenantId },
      data: { subscriptionStatus: 'ACTIVE', seats: 5, trialEndsAt: null },
    });

  console.log(
    `  ✓ ${clients.length} clientes · ${firm.matters} expedientes · ${issued} facturas · ${leads} prospectos`,
  );
}

// ── Perfiles de facturación ──────────────────────────────────────────────────
const ES_PROFILE = (i) => ({
  format: 'es',
  currency: 'EUR',
  taxCode: 'IVA_STANDARD',
  withholding: 'IRPF_GENERAL',
  fee: String(900 + i * 175) + '.00',
  rate: '120.00',
  provision: '1500.00',
  titles: ES_MATTERS,
  types: ES_TYPES,
  deadline: 'Contestación a la demanda',
});
const DO_PROFILE = (i) => ({
  format: 'do',
  currency: 'DOP',
  taxCode: 'ITBIS_STANDARD',
  withholding: undefined,
  fee: String(35000 + i * 9000) + '.00',
  rate: '4500.00',
  provision: '60000.00',
  titles: DO_MATTERS,
  types: DO_TYPES,
  deadline: 'Plazo para concluir',
});

// ── Configuración de las 3 firmas ────────────────────────────────────────────
const firmsConfig = [
  {
    key: 'es',
    label: 'ES PURO — Bufete García & Asociados (Madrid)',
    name: 'Bufete García & Asociados',
    email: 'es@demo.lawzora',
    adminName: 'Laura García',
    jurisdiction: 'es',
    currency: 'EUR',
    taxId: cif(1234567),
    matters: 6,
    clients: Array.from({ length: 5 }, (_, i) => esClient(i)),
    phone: (i) => `+34 6${String(10000000 + i * 11111).slice(0, 8)}`,
    address: (i) => `C/ Serrano ${20 + i}, 28001 Madrid`,
    profileFor: (i) => ES_PROFILE(i),
    leadPeople: ['Andrés Vidal Soler', 'Patricia Gómez Ruiz', 'Construcciones Nova S.L.', 'Roberto Díaz Mena', 'Marta Ruiz Crespo'],
    leadSubjects: ['Despido y reclamación de salarios', 'Reclamación de cantidad a proveedor', 'Constitución de una S.L.', 'Divorcio de mutuo acuerdo', 'Revisión de contrato de alquiler'],
  },
  {
    key: 'do',
    label: 'DO PURO — Pérez & Asociados, S.R.L. (Santo Domingo)',
    name: 'Pérez & Asociados, S.R.L.',
    email: 'do@demo.lawzora',
    adminName: 'José Pérez',
    jurisdiction: 'do',
    currency: 'DOP',
    taxId: rnc(13100001),
    matters: 6,
    clients: Array.from({ length: 5 }, (_, i) => doClient(i)),
    phone: (i) => `+1 809 ${String(2000000 + i * 13131).slice(0, 7)}`,
    address: (i) => `Av. Winston Churchill ${50 + i}, Santo Domingo`,
    profileFor: (i) => DO_PROFILE(i),
    leadPeople: ['Pedro Guerrero Lora', 'Yokasta Méndez Pérez', 'Comercial Tropical SRL', 'Luis Familia Cruz', 'Rosa Encarnación Díaz'],
    leadSubjects: ['Cobro de pesos por pagaré', 'Desalojo por falta de pago', 'Constitución de una SRL', 'Demanda de pensión alimentaria', 'Daños y perjuicios por accidente'],
  },
  {
    key: 'dual',
    label: 'DUAL — Lex Caribe Abogados (España + Rep. Dominicana)',
    name: 'Lex Caribe Abogados',
    email: 'dual@demo.lawzora',
    adminName: 'Marta Núñez',
    jurisdiction: 'es', // sede en ES; factura también en formato RD para clientes dominicanos
    currency: 'EUR',
    taxId: cif(7654321),
    matters: 6,
    // Mitad clientes ES (NIF/CIF) y mitad DO (RNC/Cédula)
    clients: [esClient(0), esClient(4), doClient(1), doClient(3), doClient(0), esClient(2)],
    phone: (i) => `+34 9${String(10000000 + i * 22222).slice(0, 8)}`,
    address: (i) => (i % 2 ? 'Av. Lope de Vega 13, Santo Domingo' : 'Pº de la Castellana 81, Madrid'),
    // El formato/moneda dependen del CLIENTE: documento ES → Verifactu/EUR; RD → e-CF/DOP.
    profileFor: (i, client) => {
      const taxId = String(client.taxId);
      const isDO = /^\d{9}$|^\d{11}$/.test(taxId); // RNC (9) o Cédula (11) → dominicano
      return isDO ? DO_PROFILE(i) : ES_PROFILE(i);
    },
    leadPeople: ['Sofía Marrero', 'Inversiones Atlántico S.L.', 'Manuel Tavárez', 'Elena Pou Vargas', 'Distribuidora Bávaro SRL'],
    leadSubjects: ['Contrato mercantil internacional', 'Reclamación de cantidad', 'Constitución de sociedad en RD', 'Divorcio internacional', 'Cobro de pesos por pagaré'],
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`API: ${API}`);
  await wipe();
  if (WIPE_ONLY) {
    console.log('✓ Solo borrado (--wipe). Hecho.');
    return;
  }
  for (const firm of firmsConfig) await seedFirm(firm);

  console.log('\n================ DEMOS LISTAS ================');
  console.log('Entra en https://lawzora.com/es/login con (contraseña común):');
  console.log(`  contraseña: ${PASSWORD}`);
  for (const f of firmsConfig) console.log(`  · ${f.email}   → ${f.label}`);
  console.log('Suscripción ACTIVE (sin muro). Vuelve a ejecutar este script para resetear.');
}

main()
  .catch((e) => {
    console.error('✗ Error:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
