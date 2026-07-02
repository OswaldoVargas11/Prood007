/**
 * Demo de REVISIÓN TABULAR contra la API real (tenant demo): sube 10 contratos de ejemplo a un
 * expediente, crea una revisión con 4 columnas en lenguaje natural, espera a que el motor complete
 * todas las celdas y verifica que cada dato viene con su CITA correcta (el snippet aparece en el
 * contexto guardado y los offsets son coherentes). Dos contratos son de CONTROL: no contienen alguna
 * de las respuestas y sus celdas deben decir "no consta" (guardrail anti-invención).
 *
 * Requiere la IA activada en el servidor (ANTHROPIC_API_KEY). Consume cuota real del tenant.
 * Uso: SEED_API=https://…/api SEED_EMAIL=… SEED_PASSWORD=… node apps/api/scripts/demo-tabular-review.mjs
 */
const API = process.env.SEED_API ?? 'http://localhost:4000/api';
const EMAIL = process.env.SEED_EMAIL ?? 'demo@demo.lawzora';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Lawzora.Demo-2026!';

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
    throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function uploadDoc(matterId, name, text) {
  const form = new FormData();
  form.append('matterId', matterId);
  form.append('name', name);
  form.append('file', new Blob([text], { type: 'text/plain' }), name);
  const res = await fetch(`${API}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${name} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Contrato sintético con los cuatro datos presentes (variando partes/fechas/leyes). */
function contract(i, { vencimiento, ley, cambioControl, penalizacion }) {
  return (
    `CONTRATO DE PRESTACIÓN DE SERVICIOS Nº ${2026000 + i}\n\n` +
    `En Madrid, a ${3 + i} de junio de 2026, entre Acme Iberia S.L. y Proveedor ${i} S.A.\n\n` +
    `CLÁUSULA 3ª. DURACIÓN Y VENCIMIENTO. El presente contrato entrará en vigor en la fecha de su firma ` +
    `y permanecerá vigente hasta el ${vencimiento}, salvo prórroga expresa acordada por escrito.\n\n` +
    (cambioControl
      ? `CLÁUSULA 7ª. CAMBIO DE CONTROL. En caso de cambio de control accionarial de cualquiera de las ` +
        `partes, la otra parte podrá resolver el contrato mediante preaviso escrito de ${30 + i} días, ` +
        `sin penalización alguna.\n\n`
      : '') +
    (penalizacion
      ? `CLÁUSULA 8ª. PENALIZACIONES. El retraso en la prestación devengará una penalización del ` +
        `${i}% del precio mensual por cada semana de demora, con un máximo del 10%.\n\n`
      : '') +
    `CLÁUSULA 12ª. LEY APLICABLE Y JURISDICCIÓN. Este contrato se rige por ${ley}, y las partes se ` +
    `someten a los juzgados y tribunales de Madrid capital.\n\n` +
    `Y en prueba de conformidad, las partes firman el presente documento por duplicado.`
  );
}

const COLUMNS = [
  { label: 'Fecha de vencimiento' },
  { label: 'Cláusula de cambio de control' },
  { label: 'Ley aplicable' },
  { label: 'Penalizaciones por retraso' },
];

async function main() {
  token = (await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;

  const status = await call('GET', '/ai/status');
  if (!status.enabled) throw new Error('La IA no está habilitada en este servidor (falta ANTHROPIC_API_KEY).');

  // Expediente contenedor de la demo (reutiliza el primero disponible).
  const mattersPage = await call('GET', '/matters?page=1&pageSize=5');
  const matter = (mattersPage.items ?? mattersPage)[0];
  if (!matter) throw new Error('El tenant demo no tiene expedientes.');
  console.log(`· Expediente: ${matter.reference} — ${matter.title}`);

  // 10 contratos: 8 completos + 2 de control (sin cambio de control / sin penalizaciones).
  console.log('· Subiendo 10 contratos…');
  const stamp = Date.now().toString(36);
  const documentIds = [];
  for (let i = 1; i <= 10; i++) {
    // Controles: el contrato 9 no tiene cláusula de cambio de control; el 10 no tiene penalizaciones.
    const body = contract(i, {
      vencimiento: `${i + 10} de diciembre de 202${6 + (i % 3)}`,
      ley: i % 2 === 0 ? 'la legislación española' : 'las leyes de la República Dominicana',
      cambioControl: i !== 9,
      penalizacion: i !== 10,
    });
    const doc = await uploadDoc(matter.id, `demo-tabular-${stamp}-contrato-${String(i).padStart(2, '0')}.txt`, body);
    documentIds.push(doc.id);
  }
  console.log(`   ${documentIds.length} documentos subidos`);

  // Revisión de 4 columnas.
  console.log('· Creando revisión tabular (4 columnas)…');
  const review = await call('POST', '/ai/tabular-reviews', {
    matterId: matter.id,
    title: `Demo revisión tabular ${stamp}`,
    columns: COLUMNS,
    documentIds,
  });
  console.log(`   id=${review.id}`);

  // Espera a que el motor complete (40 celdas).
  process.stdout.write('· Extrayendo');
  let detail;
  for (let tick = 0; tick < 120; tick++) {
    detail = await call('GET', `/ai/tabular-reviews/${review.id}`);
    const pending = detail.cells.filter((c) => c.status === 'PENDING').length;
    if (pending === 0) break;
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log('');

  // Informe + verificación de citas.
  const byKey = new Map(detail.cells.map((c) => [`${c.documentId}:${c.columnId}`, c]));
  let done = 0;
  let notFound = 0;
  let failed = 0;
  let badCitations = 0;
  for (const doc of detail.documents) {
    const row = [doc.name.replace(`demo-tabular-${stamp}-`, '')];
    for (const col of detail.columns) {
      const cell = byKey.get(`${doc.id}:${col.id}`);
      if (!cell || cell.status === 'FAILED') {
        failed++;
        row.push(`✗ ${cell?.error ?? '?'}`);
        continue;
      }
      if (cell.notFound) {
        notFound++;
        row.push('— no consta');
        continue;
      }
      done++;
      // La cita debe "abrir el fragmento correcto": snippet presente y contenido en el contexto.
      const ok =
        cell.snippet &&
        cell.context &&
        cell.context.includes(cell.snippet) &&
        Number.isInteger(cell.charStart) &&
        Number.isInteger(cell.charEnd) &&
        cell.charEnd - cell.charStart === cell.snippet.length;
      if (!ok) badCitations++;
      row.push(`${cell.value}${ok ? '' : ' [CITA INVÁLIDA]'}`);
    }
    console.log('  ' + row.join(' | '));
  }
  console.log(
    `\nResumen: ${done} celdas con dato, ${notFound} "no consta", ${failed} con error, ` +
      `${badCitations} citas inválidas (debe ser 0).`,
  );
  if (failed > 0 || badCitations > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
