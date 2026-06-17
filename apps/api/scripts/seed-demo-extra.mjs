/**
 * Enriquecimiento de la demo con features recientes (Fases 1-5): KYC/AML, plantillas de documento,
 * documentos generados, recordatorios de plazos, barrido de dunning y firma electrónica (Signaturit).
 * Idempotente "best-effort" (las plantillas se crean siempre; el resto tolera duplicados).
 * Requiere la API en :4000.
 *
 * Para que algunas firmas queden FIRMADAS, la API y este script deben compartir el mismo secreto del
 * webhook (`SIGNATURE_WEBHOOK_SECRET`); si no coincide, esas firmas se quedan PENDING (no rompe).
 *
 * Uso: node apps/api/scripts/seed-demo-extra.mjs
 */
import { createHmac } from 'node:crypto';

const API = process.env.SEED_API ?? 'http://localhost:4000/api';
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.test';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sup3rSecret!2026';
const SIGNATURE_SECRET =
  process.env.SIGNATURE_WEBHOOK_SECRET ?? 'whsec_demo_signaturit_2026';

let token = '';
async function call(method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.status === 204 ? null : res.json();
}

/** Simula el callback firmado de Signaturit (marca la solicitud como SIGNED). Requiere mismo secreto. */
async function markSigned(sig) {
  const body = JSON.stringify({
    externalId: sig.externalId,
    tenantId: sig.tenantId,
    status: 'SIGNED',
  });
  const signature = createHmac('sha256', SIGNATURE_SECRET).update(body).digest('hex');
  const res = await fetch(`${API}/signatures/webhook/signaturit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signaturit-signature': signature },
    body,
  });
  return res.ok;
}

const STATUSES = ['APPROVED', 'IN_REVIEW', 'PENDING', 'APPROVED', 'REJECTED'];
const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'LOW', 'MEDIUM'];

const TEMPLATES = [
  {
    name: 'Carta de reclamación de cantidad',
    description: 'Reclamación extrajudicial de deuda.',
    body:
      '<h2>Reclamación de cantidad</h2><p>En {{despacho.nombre}} (NIF {{despacho.nif}}), a {{fecha}}.</p>' +
      '<p>Estimado/a {{cliente.nombre}} (NIF {{cliente.nif}}), en relación con el expediente ' +
      '<b>{{expediente.referencia}}</b> — {{expediente.titulo}}, le requerimos el abono de la cantidad adeudada.</p>',
  },
  {
    name: 'Hoja de encargo profesional',
    description: 'Encargo y honorarios.',
    body:
      '<h2>Hoja de encargo</h2><p>Cliente: {{cliente.nombre}} ({{cliente.nif}}).</p>' +
      '<p>Asunto: {{expediente.titulo}} (ref. {{expediente.referencia}}, tipo {{expediente.tipo}}).</p>' +
      '<p>Despacho: {{despacho.nombre}}. Fecha: {{fecha}}.</p>',
  },
  {
    name: 'Escrito de personación',
    description: 'Personación en procedimiento.',
    body: '<p>Don/Doña, en nombre de {{cliente.nombre}}, comparece en el expediente {{expediente.referencia}} ({{fecha}}).</p>',
  },
];

async function main() {
  token = (await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;

  console.log('· KYC/AML de clientes…');
  const clientsPage = await call('GET', '/clients?page=1&pageSize=100');
  const clients = clientsPage.items ?? clientsPage;
  let kn = 0;
  for (let i = 0; i < clients.length; i += 1) {
    await call('PUT', `/kyc/${clients[i].id}`, {
      status: STATUSES[i % STATUSES.length],
      risk: RISKS[i % RISKS.length],
      isPep: i % 7 === 0,
      identityVerified: i % 3 !== 0,
      sanctionsChecked: i % 2 === 0,
      notes: i % 5 === 0 ? 'Cliente recurrente; documentación de identidad en archivo.' : undefined,
    }).then(() => (kn += 1)).catch(() => {});
  }
  console.log(`  ${kn} perfiles KYC`);

  console.log('· Plantillas de documento…');
  const templates = [];
  for (const t of TEMPLATES) {
    const created = await call('POST', '/templates', t).catch(() => null);
    if (created) templates.push(created);
  }
  console.log(`  ${templates.length} plantillas`);

  console.log('· Documentos generados desde plantilla…');
  const mattersPage = await call('GET', '/matters?page=1&pageSize=100');
  const matters = mattersPage.items ?? mattersPage;
  let gn = 0;
  for (let i = 0; i < matters.length && templates.length > 0; i += 1) {
    const tpl = templates[i % templates.length];
    await call('POST', '/documents/from-template', {
      templateId: tpl.id,
      matterId: matters[i].id,
      name: `${tpl.name} — ${matters[i].reference}`,
    }).then(() => (gn += 1)).catch(() => {});
  }
  console.log(`  ${gn} documentos generados`);

  console.log('· Firmas electrónicas (Signaturit)…');
  const SIGNERS = [
    { name: 'Ana Pérez Soler', email: 'ana.perez@cliente.test' },
    { name: 'Luis García Mena', email: 'luis.garcia@cliente.test' },
    { name: 'Marta Ruiz Vidal', email: 'marta.ruiz@cliente.test' },
    { name: 'Carlos Díaz Roca', email: 'carlos.diaz@cliente.test' },
  ];
  const createdSigs = [];
  for (let i = 0; i < matters.length && createdSigs.length < 8; i += 1) {
    const docs = await call('GET', `/documents/by-matter/${matters[i].id}`).catch(() => []);
    const doc = (docs ?? []).find((d) => d.versions && d.versions.length > 0);
    if (!doc) continue;
    const signer = SIGNERS[createdSigs.length % SIGNERS.length];
    const sig = await call('POST', '/signatures', {
      versionId: doc.versions[0].id,
      signerName: signer.name,
      signerEmail: signer.email,
    }).catch(() => null);
    if (sig) createdSigs.push(sig);
  }
  // Reparte estados para una demo realista: ~mitad firmadas (webhook), una cancelada, resto pendiente.
  let signed = 0;
  let canceled = 0;
  for (let i = 0; i < createdSigs.length; i += 1) {
    if (i % 2 === 0) {
      if (await markSigned(createdSigs[i]).catch(() => false)) signed += 1;
    } else if (i === 1) {
      await call('POST', `/signatures/${createdSigs[i].id}/cancel`)
        .then(() => (canceled += 1))
        .catch(() => {});
    }
  }
  console.log(
    `  ${createdSigs.length} solicitudes · ${signed} firmadas · ${canceled} canceladas · resto pendientes`,
  );

  console.log('· Recordatorios de plazos + dunning…');
  const rem = await call('POST', '/tasks/run-reminders').catch(() => ({}));
  const dun = await call('POST', '/dunning/run').catch(() => ({}));
  console.log(`  plazos avisados: ${rem.reminded ?? 0} · dunning: ${JSON.stringify(dun).slice(0, 120)}`);

  const summary = await call('GET', '/kyc/summary');
  console.log(
    `✓ Extra completado. KYC → total:${summary.total} pendientes:${summary.byStatus.PENDING} ` +
      `riesgo alto:${summary.highRisk} PEP:${summary.pep}`,
  );
}

main().catch((e) => {
  console.error('✗ Error:', e.message);
  process.exit(1);
});
