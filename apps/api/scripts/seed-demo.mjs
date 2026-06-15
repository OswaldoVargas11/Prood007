/**
 * Siembra de datos de demostración (no producción). Crea clientes, expedientes, tareas, tiempo,
 * facturas (repartidas en varios meses para el gráfico), documentos y mensajes contra la API REAL,
 * de modo que todo pase por validación y cumplimiento (Verifactu/e-CF, plazos, auditoría).
 *
 * Uso:  node apps/api/scripts/seed-demo.mjs
 * Requiere la API en http://localhost:4000 y un admin (por defecto admin@demo.test).
 */

const API = process.env.SEED_API ?? 'http://localhost:4000/api';
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.test';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sup3rSecret!2026';

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
function nif(n) {
  const num = String(n).padStart(8, '0');
  return num + NIF_LETTERS[Number(num) % 23];
}

let token = '';
async function call(method, path, body, isForm = false) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (isForm) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

const pick = (arr, i) => arr[i % arr.length];
const TYPES = ['Civil', 'Mercantil', 'Laboral', 'Penal', 'Familia', 'Administrativo'];
const FIRST = ['María', 'Juan', 'Lucía', 'Carlos', 'Ana', 'Pedro', 'Elena', 'Javier'];
const LAST = ['García', 'Fernández', 'López', 'Martín', 'Sánchez', 'Núñez', 'Romero', 'Costa'];
const MATTER_TITLES = [
  'Incumplimiento contractual — maquinaria',
  'Recurso de apelación civil',
  'Reclamación de cantidad',
  'Despido improcedente',
  'Constitución de sociedad',
  'Arrendamiento — local comercial',
  'Herencia y partición',
  'Reclamación de daños',
];

function monthsAgoISO(m) {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  d.setDate(10);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('· Login…');
  const auth = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = auth.accessToken;

  // 1) Clientes
  console.log('· Clientes…');
  const clients = [];
  for (let i = 0; i < 6; i += 1) {
    const name = `${pick(FIRST, i)} ${pick(LAST, i)} ${pick(LAST, i + 3)}`;
    const c = await call('POST', '/clients', {
      name,
      taxId: nif(10000000 + i * 1234567),
      email: `cliente${i}@correo.test`,
      phone: `+34 6${String(10000000 + i).slice(0, 8)}`,
      address: `C/ Mayor ${10 + i}, Madrid`,
    });
    clients.push(c);
  }

  // 2) Expedientes + tareas + tiempo + ledger + factura + documentos + chat
  console.log('· Expedientes y actividad…');
  const STATUS_FLOW = ['IN_PROGRESS', 'ON_HOLD', 'IN_PROGRESS', 'CLOSED'];
  for (let i = 0; i < 8; i += 1) {
    const client = pick(clients, i);
    const matter = await call('POST', '/matters', {
      title: pick(MATTER_TITLES, i),
      type: pick(TYPES, i),
      clientId: client.id,
    });

    // estado variado
    if (i % 4 !== 0) {
      const target = pick(STATUS_FLOW, i);
      await call('PATCH', `/matters/${matter.id}/status`, { status: 'IN_PROGRESS' }).catch(() => {});
      if (target !== 'IN_PROGRESS')
        await call('PATCH', `/matters/${matter.id}/status`, { status: target }).catch(() => {});
    }

    // tareas (1 procesal con plazo + 1 normal)
    await call('POST', '/tasks/from-deadline', {
      deadlineType: 'Contestación a la demanda',
      startDate: new Date().toISOString().slice(0, 10),
      days: 10 + i,
      matterId: matter.id,
    }).catch(() => {});
    const task = await call('POST', '/tasks', {
      title: `Preparar escrito · ${pick(MATTER_TITLES, i)}`,
      matterId: matter.id,
      dueDate: monthsAgoISO(-1),
    });
    if (i % 3 === 0) await call('PATCH', `/tasks/${task.id}`, { status: 'DONE' }).catch(() => {});

    // ledger: provisión + tiempo
    await call('POST', '/ledger/entries', {
      matterId: matter.id,
      type: 'PROVISION',
      amount: String(500 + i * 100) + '.00',
      description: 'Provisión de fondos',
    });
    await call('POST', '/ledger/time', {
      matterId: matter.id,
      description: 'Estudio del asunto y reunión',
      minutes: 60 + i * 15,
      hourlyRate: '120.00',
      workedAt: monthsAgoISO(1),
    });

    // factura (repartida en los últimos 6 meses); algunas pagadas
    const inv = await call('POST', '/ledger/invoices', {
      matterId: matter.id,
      issueDate: monthsAgoISO(i % 6),
      withholdingTaxCode: 'IRPF_GENERAL',
      lines: [
        {
          description: 'Honorarios profesionales',
          quantity: '1',
          unitPrice: String(800 + i * 150) + '.00',
          taxCode: 'IVA_STANDARD',
        },
      ],
    });
    if (i % 2 === 0) await call('POST', `/ledger/invoices/${inv.invoice.id}/pay`).catch(() => {});

    // documentos (subida + revisión)
    if (i < 4) {
      const fd = new FormData();
      fd.append('file', new Blob([`Escrito del expediente ${matter.reference}`], { type: 'text/plain' }), 'escrito.txt');
      fd.append('matterId', matter.id);
      fd.append('name', `Escrito ${matter.reference}.txt`);
      const doc = await call('POST', '/documents', fd, true).catch(() => null);
      if (doc?.version) {
        const status = i % 2 === 0 ? 'APPROVED' : 'IN_REVIEW';
        await call('POST', `/documents/versions/${doc.version.id}/review`, {
          status,
          comment: 'Revisión inicial',
        }).catch(() => {});
      }
    }

    // chat
    await call('POST', `/matters/${matter.id}/messages`, {
      body: `Buenos días, ¿alguna novedad sobre ${pick(MATTER_TITLES, i)}?`,
    }).catch(() => {});
  }

  console.log('✓ Seed completado.');
  const summary = await call('GET', '/dashboard/summary');
  console.log(
    `  KPIs → activos:${summary.kpis.activeMatters} clientes:${summary.kpis.totalClients} ` +
      `facturable:${summary.kpis.billableThisMonth} revisiones:${summary.kpis.pendingReviews}`,
  );
}

main().catch((e) => {
  console.error('✗ Error de seed:', e.message);
  process.exit(1);
});
