/**
 * Enriquecimiento "showcase" de la demo: puebla las funcionalidades que los seeds base no tocan,
 * para que NINGUNA sección salga vacía al enseñar el producto:
 *   - 2º letrado (multi-letrado / equipo)
 *   - Carpetas por expediente (organización documental)
 *   - Biblioteca de cláusulas + snippets de correo
 *   - Vistas guardadas (facturas / tareas / expedientes)
 *   - Tipo de gestión con requisitos + plantillas de tarea, y checklist aplicada a un expediente
 *   - Reacciones de chat sobre mensajes existentes
 *   - Usuario de portal para un cliente (portal del cliente demoable)
 *
 * Todo vía la API REAL (validación/compliance). Idempotente "best-effort" (tolera duplicados).
 * Uso: SEED_API=... SEED_EMAIL=... SEED_PASSWORD=... node apps/api/scripts/seed-demo-showcase.mjs
 */
const API = process.env.SEED_API ?? 'http://localhost:4000/api';
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.test';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sup3rSecret!2026';

let token = '';
async function call(method, path, body, ok = []) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if (ok.includes(res.status)) return null;
    throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  return res.status === 204 ? null : res.json();
}
const soft = (p) => p.catch((e) => {
  console.log(`   · (omitido) ${e.message}`);
  return null;
});

async function main() {
  token = (await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;

  // 1) Equipo: un 2º letrado.
  console.log('· Equipo (multi-letrado)…');
  const teammate = await soft(
    call('POST', '/users', {
      email: 'letrada@demo.lawzora',
      fullName: 'Lucía Fernández (Letrada)',
      password: 'Lawzora.Demo-2026!',
      role: 'LAWYER',
    }, [409]),
  );
  console.log(`   ${teammate ? '1 letrado añadido (letrada@demo.lawzora)' : 'ya existía / omitido'}`);

  const mattersPage = await call('GET', '/matters?page=1&pageSize=100');
  const matters = mattersPage.items ?? mattersPage;
  const clientsPage = await call('GET', '/clients?page=1&pageSize=100');
  const clients = clientsPage.items ?? clientsPage;

  // 2) Carpetas por expediente.
  console.log('· Carpetas documentales…');
  let folders = 0;
  for (let i = 0; i < Math.min(matters.length, 5); i++) {
    for (const name of ['Demandas y escritos', 'Contratos', 'Correspondencia']) {
      const f = await soft(
        call('POST', '/folders', { kind: 'DOCUMENT', matterId: matters[i].id, name }),
      );
      if (f) folders++;
    }
  }
  console.log(`   ${folders} carpetas`);

  // 3) Biblioteca de cláusulas.
  console.log('· Biblioteca de cláusulas…');
  const CLAUSES = [
    { name: 'Confidencialidad', body: 'Las partes se obligan a mantener la más estricta confidencialidad sobre la información intercambiada con ocasión del presente contrato, durante su vigencia y los cinco (5) años siguientes a su terminación.' },
    { name: 'Sumisión a fuero', body: 'Para cuantas cuestiones se susciten en relación con el presente contrato, las partes se someten expresamente a los Juzgados y Tribunales de Madrid, con renuncia a cualquier otro fuero que pudiera corresponderles.' },
    { name: 'Protección de datos (RGPD)', body: 'Los datos personales serán tratados conforme al Reglamento (UE) 2016/679 y la LOPDGDD, con la finalidad de ejecutar la relación contractual, conservándose durante los plazos legalmente exigibles.' },
    { name: 'Penalización por mora', body: 'El retraso en el pago devengará automáticamente un interés de demora equivalente al tipo legal del dinero incrementado en dos puntos, sin necesidad de requerimiento previo.' },
  ];
  let nc = 0;
  for (const c of CLAUSES) if (await soft(call('POST', '/clauses', c))) nc++;
  console.log(`   ${nc} cláusulas`);

  // 4) Snippets de correo.
  console.log('· Snippets de correo…');
  const SNIPPETS = [
    { name: 'Acuse de recibo', subject: 'Hemos recibido su documentación', body: 'Estimado/a cliente:\n\nLe confirmamos la recepción de la documentación remitida. Procedemos a su estudio y le daremos respuesta a la mayor brevedad.\n\nUn cordial saludo,' },
    { name: 'Solicitud de provisión', subject: 'Provisión de fondos', body: 'Estimado/a cliente:\n\nPara continuar con la tramitación de su asunto, le rogamos atienda la provisión de fondos indicada en la factura adjunta.\n\nGracias por su confianza.' },
    { name: 'Recordatorio de vista', subject: 'Próxima señalamiento', body: 'Le recordamos que tiene señalada vista en los próximos días. Le contactaremos para preparar su comparecencia.' },
  ];
  let ns = 0;
  for (const s of SNIPPETS) if (await soft(call('POST', '/email-snippets', s))) ns++;
  console.log(`   ${ns} snippets`);

  // 5) Vistas guardadas.
  console.log('· Vistas guardadas…');
  const VIEWS = [
    { scope: 'invoices', name: 'Facturas vencidas', filters: { status: 'OVERDUE' } },
    { scope: 'tasks', name: 'Mis plazos próximos', filters: { dueWithinDays: 14, kind: 'DEADLINE' } },
    { scope: 'matters', name: 'Expedientes en curso', filters: { status: 'IN_PROGRESS' } },
  ];
  let nv = 0;
  for (const v of VIEWS) if (await soft(call('POST', '/saved-views', v))) nv++;
  console.log(`   ${nv} vistas guardadas`);

  // 6) Tipo de gestión + checklist aplicada.
  console.log('· Tipo de gestión + checklist…');
  const ptype = await soft(
    call('POST', '/presentation-types', {
      name: 'Constitución de S.L.',
      sector: 'Mercantil',
      jurisdiction: 'es',
      description: 'Documentación y plazos para la constitución de una sociedad de responsabilidad limitada.',
      requirements: [
        { name: 'DNI/NIE de los socios', required: true, order: 0 },
        { name: 'Certificación negativa de denominación social', required: true, order: 1 },
        { name: 'Estatutos sociales', required: true, order: 2 },
        { name: 'Justificante de desembolso del capital', required: true, order: 3 },
        { name: 'Alta censal (modelo 036)', required: false, order: 4 },
      ],
      taskTemplates: [
        { title: 'Solicitar certificación de denominación', offsetDays: 1, order: 0 },
        { title: 'Otorgar escritura ante notario', offsetDays: 7, order: 1 },
        { title: 'Inscribir en el Registro Mercantil', offsetDays: 20, order: 2 },
      ],
    }),
  );
  let checklistApplied = 0;
  if (ptype && matters.length) {
    const chk = await soft(
      call('POST', '/presentation-checklists', {
        matterId: matters[0].id,
        presentationTypeId: ptype.id,
      }),
    );
    if (chk) {
      checklistApplied = 1;
      const items = chk.items ?? [];
      for (let i = 0; i < items.length && i < 2; i++) {
        await soft(call('PATCH', `/presentation-checklists/items/${items[i].id}`, { status: 'UPLOADED' }));
      }
    }
  }
  console.log(`   tipo de gestión ${ptype ? 'creado' : 'omitido'} · checklist aplicada: ${checklistApplied}`);

  // 7) Reacciones de chat sobre mensajes existentes.
  console.log('· Reacciones de chat…');
  let reactions = 0;
  const EMOJIS = ['👍', '✅', '🙏'];
  for (let i = 0; i < Math.min(matters.length, 4); i++) {
    const msgs = await soft(call('GET', `/matters/${matters[i].id}/messages`));
    const list = msgs?.items ?? msgs ?? [];
    if (list.length) {
      const r = await soft(
        call('POST', `/matters/${matters[i].id}/messages/${list[0].id}/react`, {
          emoji: EMOJIS[i % EMOJIS.length],
        }),
      );
      if (r) reactions++;
    }
  }
  console.log(`   ${reactions} reacciones`);

  // 8) Usuario de portal para un cliente (portal del cliente demoable).
  console.log('· Portal del cliente…');
  let portal = 0;
  if (clients.length) {
    const pu = await soft(
      call('POST', `/clients/${clients[0].id}/portal-user`, {
        email: 'cliente.portal@demo.lawzora',
        password: 'Lawzora.Demo-2026!',
        fullName: clients[0].name,
      }, [409]),
    );
    if (pu) portal = 1;
  }
  console.log(`   usuario de portal: ${portal ? 'cliente.portal@demo.lawzora' : 'omitido'}`);

  console.log('✓ Showcase completado.');
}

main().catch((e) => {
  console.error('✗ Error:', e.message);
  process.exit(1);
});
