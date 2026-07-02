/**
 * Demo de REVISIÓN POR PLAYBOOK contra la API real (tenant demo): instala el playbook semilla de la
 * jurisdicción (si no está ya), sube un contrato sintético con una cláusula DESVIADA plantada
 * (responsabilidad ilimitada, deal-breaker) y SIN cláusula de confidencialidad (tema ausente), lanza la
 * revisión, espera al motor y verifica el informe: citas válidas (snippet contenido en el contexto y
 * offsets coherentes), la desviación plantada detectada, el tema ausente marcado MISSING sin cita, y el
 * PDF descargable. Requiere IA activada en el servidor (ANTHROPIC_API_KEY). Consume cuota real.
 *
 * Uso: SEED_API=https://…/api SEED_EMAIL=… SEED_PASSWORD=… node apps/api/scripts/demo-playbook-review.mjs
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

/**
 * Contrato sintético: ley aplicable y terminación CUMPLEN las posiciones del playbook semilla ES;
 * responsabilidad y pago se DESVÍAN (la primera es deal-breaker); confidencialidad y protección de
 * datos NO aparecen (deben reportarse como ausentes, nunca rellenarse).
 */
function contract(stamp) {
  return (
    `CONTRATO DE PRESTACIÓN DE SERVICIOS Nº ${stamp}\n\n` +
    `En Madrid, a 2 de julio de 2026, entre Acme Iberia S.L. (el "Cliente") y Consultora Delta S.A. ` +
    `(el "Prestador").\n\n` +
    `CLÁUSULA 3ª. DURACIÓN Y TERMINACIÓN. El contrato entrará en vigor a su firma. Cualquiera de las ` +
    `partes podrá resolverlo mediante preaviso escrito de treinta (30) días, sin penalización, y la ` +
    `resolución no afectará a los importes devengados hasta la fecha de efectos.\n\n` +
    `CLÁUSULA 5ª. PRECIO Y PAGO. Las facturas se abonarán en el plazo de noventa (90) días desde su ` +
    `recepción, previa aprobación discrecional del departamento de compras del Cliente. El Prestador ` +
    `renuncia expresamente a reclamar intereses de demora.\n\n` +
    `CLÁUSULA 7ª. RESPONSABILIDAD. El Prestador responderá de forma ilimitada de cualesquiera daños y ` +
    `perjuicios, directos o indirectos, incluido el lucro cesante, causados al Cliente, sin límite ` +
    `alguno de cuantía. El Cliente no asume responsabilidad alguna frente al Prestador.\n\n` +
    `CLÁUSULA 9ª. PROPIEDAD INTELECTUAL. Los derechos sobre los entregables desarrollados en ejecución ` +
    `del contrato se cederán al Cliente con el pago íntegro del precio. El Prestador conserva sus ` +
    `herramientas y conocimientos previos, con licencia de uso a favor del Cliente en lo necesario.\n\n` +
    `CLÁUSULA 12ª. LEY APLICABLE Y JURISDICCIÓN. Este contrato se rige por la legislación española y ` +
    `las partes se someten a los Juzgados y Tribunales de la ciudad de Madrid, con renuncia expresa a ` +
    `cualquier otro fuero.\n\n` +
    `Y en prueba de conformidad, las partes firman el presente documento por duplicado.`
  );
}

async function main() {
  token = (await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;

  const status = await call('GET', '/ai/status');
  if (!status.enabled) throw new Error('La IA no está habilitada en este servidor (falta ANTHROPIC_API_KEY).');

  // Playbook semilla (idempotente: si ya existe, se reutiliza).
  let playbook;
  try {
    playbook = await call('POST', '/ai/playbooks/seed');
    console.log(`· Playbook semilla instalado: ${playbook.name} (${playbook.rules.length} reglas)`);
  } catch {
    const all = await call('GET', '/ai/playbooks');
    playbook = all.find((p) => p.name.includes('ejemplo')) ?? all[0];
    if (!playbook) throw new Error('No hay playbooks en el tenant demo.');
    console.log(`· Playbook existente: ${playbook.name}`);
  }

  // Expediente contenedor de la demo (reutiliza el primero disponible).
  const mattersPage = await call('GET', '/matters?page=1&pageSize=5');
  const matter = (mattersPage.items ?? mattersPage)[0];
  if (!matter) throw new Error('El tenant demo no tiene expedientes.');
  console.log(`· Expediente: ${matter.reference} — ${matter.title}`);

  // Contrato entrante sintético (desviación plantada + temas ausentes).
  const stamp = Date.now().toString(36);
  const uploaded = await uploadDoc(
    matter.id,
    `demo-playbook-${stamp}-contrato-entrante.txt`,
    contract(stamp),
  );
  // POST /documents devuelve { document, version }.
  const documentId = uploaded.document.id;
  console.log(`· Contrato subido: ${uploaded.document.name}`);

  // Revisión contra el playbook.
  const review = await call('POST', '/ai/playbooks/reviews', { playbookId: playbook.id, documentId });
  console.log(`· Revisión lanzada: id=${review.id}`);

  // Espera a que el motor complete todas las reglas.
  process.stdout.write('· Revisando');
  let detail;
  for (let tick = 0; tick < 120; tick++) {
    detail = await call('GET', `/ai/playbooks/reviews/${review.id}`);
    const pending = detail.findings.filter((f) => f.status === 'PENDING').length;
    if (pending === 0) break;
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log('');

  // Informe + verificación de guardrails.
  let failed = 0;
  let badCitations = 0;
  let deviations = 0;
  let missing = 0;
  let missingWithQuote = 0;
  for (const f of detail.findings) {
    if (f.status === 'FAILED') {
      failed++;
      console.log(`  ✗ ${f.topic}: ERROR ${f.error}`);
      continue;
    }
    if (f.outcome === 'MISSING') {
      missing++;
      if (f.snippet) missingWithQuote++;
      console.log(`  — ${f.topic}: AUSENTE (confianza ${f.confidence})`);
      continue;
    }
    // Cumple/desviación: la cita debe "abrir el fragmento correcto".
    const ok =
      f.snippet &&
      f.context &&
      f.context.includes(f.snippet) &&
      Number.isInteger(f.charStart) &&
      Number.isInteger(f.charEnd) &&
      f.charEnd - f.charStart === f.snippet.length;
    if (!ok) badCitations++;
    if (f.outcome === 'DEVIATION') deviations++;
    const mark = f.outcome === 'DEVIATION' ? (f.dealBreaker ? '‼' : '△') : '✓';
    console.log(
      `  ${mark} ${f.topic}: ${f.outcome}${f.dealBreaker ? ' (DEAL-BREAKER)' : ''}${ok ? '' : ' [CITA INVÁLIDA]'}\n` +
        `     «${(f.snippet ?? '').slice(0, 110)}…»`,
    );
  }

  // El PDF del informe debe descargarse y ser un PDF real.
  const pdfRes = await fetch(`${API}/ai/playbooks/reviews/${review.id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pdf = Buffer.from(await pdfRes.arrayBuffer());
  const pdfOk = pdfRes.ok && pdf.subarray(0, 5).toString('ascii') === '%PDF-';
  console.log(`· PDF del informe: ${pdfOk ? `OK (${pdf.length} bytes)` : 'ERROR'}`);

  const liability = detail.findings.find((f) => /responsabilidad/i.test(f.topic));
  const confidentiality = detail.findings.find((f) => /confidencialidad/i.test(f.topic));
  const plantedOk = liability?.outcome === 'DEVIATION';
  const absentOk = confidentiality?.outcome === 'MISSING';

  console.log(
    `\nResumen: ${deviations} desviaciones, ${missing} ausentes, ${failed} con error, ` +
      `${badCitations} citas inválidas (debe ser 0), ${missingWithQuote} ausentes con cita (debe ser 0).\n` +
      `  Desviación plantada (responsabilidad ilimitada) detectada: ${plantedOk ? 'SÍ' : 'NO'}\n` +
      `  Tema ausente (confidencialidad) marcado MISSING: ${absentOk ? 'SÍ' : 'NO'}`,
  );
  if (failed > 0 || badCitations > 0 || missingWithQuote > 0 || !pdfOk || !plantedOk || !absentOk) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
