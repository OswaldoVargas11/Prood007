/**
 * ESCENARIO 3 — Mercantil general con SECRETARÍA DE SOCIEDADES activa: el despacho lleva el libro de
 * actas y el libro de socios de varias sociedades, sus movimientos de participaciones y las
 * obligaciones recurrentes al Registro. Además, una operación viva de ENTRADA DE SOCIO (ampliación de
 * capital) con data room, redline de estatutos, checklist de cierre, hoja de encargo y facturación
 * Verifactu + e-CF (sandbox). Todo ficticio.
 */
import { provisionTenant } from '../lib/provision.mjs';
import {
  createClient,
  createMatter,
  addActivity,
  addMessages,
  createDocument,
  createDataRoom,
  createClosingChecklist,
  createEngagementLetter,
  addTask,
  addProceduralDeadline,
  addTimeEntries,
  addLeads,
  addDunningReminder,
} from '../lib/builders.mjs';
import {
  addCorporateMinutes,
  addShareholders,
  addShareTransfers,
  addRegistryObligations,
} from '../lib/company-secretary.mjs';
import { issueInvoice } from '../lib/fiscal.mjs';
import { nif, cif, rnc } from '../lib/identifiers.mjs';
import { monthsAgo, daysFromNow } from '../lib/env.mjs';

export async function seed(prisma, storage, cfg) {
  const { tenant, admin, lawyers } = await provisionTenant(prisma, cfg);
  const [a1, a2] = lawyers;

  // ── Clientes (sociedades en cartera de secretaría) ────────────────────────────
  const company = await createClient(prisma, tenant, {
    name: 'Distribuidora Meridiano, S.L.',
    taxId: cif(9910303),
    taxIdKind: 'CIF',
    email: 'secretaria@meridiano.demo',
    phone: '+34 916 880 010',
    address: 'C/ Alcalá 200, 28028 Madrid',
    kyc: { risk: 'LOW' },
  });
  const company2 = await createClient(prisma, tenant, {
    name: 'Talento Digital Ibérica, S.L.',
    taxId: cif(8810313),
    taxIdKind: 'CIF',
    email: 'legal@talentodigital.demo',
    phone: '+34 916 880 020',
    address: 'C/ Orense 4, 28020 Madrid',
  });
  const incomingInvestor = await createClient(prisma, tenant, {
    name: 'Brújula Ventures, S.L.',
    taxId: cif(7710323),
    taxIdKind: 'CIF',
    email: 'deals@brujulaventures.demo',
    phone: '+34 916 880 030',
    address: 'Pº de la Castellana 200, 28046 Madrid',
    kyc: { risk: 'LOW' },
  });
  const doCompany = await createClient(prisma, tenant, {
    name: 'Antillas Trading, SRL',
    taxId: rnc(13609101),
    taxIdKind: 'RNC',
    email: 'admin@antillastrading.demo',
    phone: '+1 809 555 0310',
    address: 'Calle El Conde 105, Santo Domingo',
    kyc: { risk: 'MEDIUM' },
  });

  // ── Secretaría de sociedades de Distribuidora Meridiano ───────────────────────
  // Libro de socios (10.000 participaciones).
  await addShareholders(prisma, tenant, company.id, [
    { name: 'Inés Calatrava Moya', taxId: nif(70334455), units: 4500 },
    { name: 'Gonzalo Pereda Sanz', taxId: nif(70445566), units: 3000 },
    { name: 'Patrimonios Reunidos, S.L.', taxId: cif(6610333), units: 2000 },
    { name: 'Inés Calatrava Moya (autocartera pendiente)', units: 500 },
  ]);
  // Libro de actas.
  await addCorporateMinutes(prisma, tenant, company.id, [
    {
      kind: 'GENERAL_MEETING',
      title: 'Acta de la Junta General Ordinaria 2025',
      meetingDate: monthsAgo(3, 28),
      body: 'Aprobación de las cuentas anuales del ejercicio 2024, aplicación del resultado (reservas voluntarias) y reelección del órgano de administración. Aprobada por unanimidad.',
    },
    {
      kind: 'GENERAL_MEETING',
      title: 'Acta de la Junta General Extraordinaria — ampliación de capital',
      meetingDate: monthsAgo(1, 14),
      body: 'Acuerdo de ampliación de capital por 200.000 € mediante creación de 2.000 nuevas participaciones, con prima de emisión, suscritas por un nuevo socio inversor. Aprobada con el 75% del capital.',
    },
    {
      kind: 'BOARD',
      title: 'Acta del Consejo de Administración — nombramiento de consejero',
      meetingDate: monthsAgo(1, 16),
      body: 'Nombramiento de un consejero dominical a propuesta del nuevo socio y delegación de facultades. Aceptación del cargo.',
    },
  ]);
  // Movimientos del libro de socios.
  await addShareTransfers(prisma, tenant, company.id, [
    {
      fromName: 'Gonzalo Pereda Sanz',
      toName: 'Patrimonios Reunidos, S.L.',
      units: 500,
      date: monthsAgo(6, 10),
      note: 'Transmisión de participaciones entre socios (derecho de adquisición preferente renunciado).',
    },
    {
      fromName: null,
      toName: 'Brújula Ventures, S.L.',
      units: 2000,
      date: monthsAgo(1, 14),
      note: 'Ampliación de capital — emisión de 2.000 participaciones nuevas con prima.',
    },
  ]);
  // Obligaciones recurrentes al Registro.
  await addRegistryObligations(prisma, tenant, company.id, [
    {
      title: 'Depósito de cuentas anuales 2024',
      dueDate: monthsAgo(2, 30),
      recurrence: 'ANNUAL',
      status: 'FILED',
      filedAt: monthsAgo(2, 25),
    },
    {
      title: 'Legalización de libros 2024',
      dueDate: monthsAgo(8, 30),
      recurrence: 'ANNUAL',
      status: 'FILED',
      filedAt: monthsAgo(8, 20),
    },
    {
      title: 'Declaración de titularidad real (actualización)',
      dueDate: daysFromNow(25),
      recurrence: 'ANNUAL',
      status: 'PENDING',
    },
    {
      title: 'Inscripción de la ampliación de capital',
      dueDate: daysFromNow(8),
      recurrence: 'NONE',
      status: 'PENDING',
    },
  ]);
  // Secretaría de la segunda sociedad (más ligera).
  await addShareholders(prisma, tenant, company2.id, [
    { name: 'Lucía Berrocal Pinto', taxId: nif(71556677), units: 6000 },
    { name: 'Marc Oliver Fontané', taxId: nif(71667788), units: 4000 },
  ]);
  await addRegistryObligations(prisma, tenant, company2.id, [
    {
      title: 'Depósito de cuentas anuales 2024',
      dueDate: monthsAgo(2, 30),
      recurrence: 'ANNUAL',
      status: 'FILED',
      filedAt: monthsAgo(2, 28),
    },
    {
      title: 'Renovación del cargo de administrador',
      dueDate: daysFromNow(40),
      recurrence: 'NONE',
      status: 'PENDING',
    },
  ]);

  // ── Expediente de secretaría (recurrente) ─────────────────────────────────────
  const secMatter = await createMatter(prisma, tenant, {
    reference: 'MC-2026-006',
    title: 'Secretaría de sociedades — Distribuidora Meridiano, S.L.',
    type: 'Mercantil · Secretaría de sociedades',
    status: 'IN_PROGRESS',
    clientId: company.id,
    lawyerId: admin.id,
    budgetAmount: '9000.00',
    proceduralPhase: 'Asesoramiento recurrente · órgano de administración',
    openedAt: monthsAgo(14, 10),
  });
  await addActivity(prisma, tenant, secMatter, admin.id, [
    {
      action: 'corporate.minute.created',
      at: monthsAgo(3, 28),
      metadata: { hito: 'Junta General Ordinaria 2025 celebrada' },
    },
    {
      action: 'registry.obligation.filed',
      at: monthsAgo(2, 25),
      metadata: { hito: 'Cuentas anuales 2024 depositadas' },
    },
    {
      action: 'corporate.minute.created',
      at: monthsAgo(1, 14),
      metadata: { hito: 'Junta extraordinaria: ampliación de capital' },
    },
    {
      action: 'share.transfer.recorded',
      at: monthsAgo(1, 14),
      metadata: { hito: 'Entrada de Brújula Ventures (2.000 participaciones)' },
    },
  ]);

  // ── Operación viva: entrada de socio (ampliación de capital) ───────────────────
  const dealMatter = await createMatter(prisma, tenant, {
    reference: 'MC-2026-011',
    title: 'Entrada de socio inversor en Distribuidora Meridiano (ampliación de capital)',
    type: 'Mercantil · Operación societaria',
    status: 'IN_PROGRESS',
    clientId: company.id,
    lawyerId: admin.id,
    budgetAmount: '28000.00',
    opposingParty: 'Brújula Ventures, S.L. (socio entrante)',
    opposingPartyTaxId: cif(7710323),
    opposingCounsel: 'Cuatro Torres Legal (asesor del inversor)',
    proceduralPhase: 'Cierre pendiente · inscripción registral',
    openedAt: monthsAgo(3, 4),
    retainer: '10000.00',
  });
  await addMessages(prisma, tenant, dealMatter, [
    {
      authorId: admin.id,
      at: monthsAgo(1, 12),
      body: 'Junta de ampliación aprobada. Pendiente el desembolso íntegro y la escritura ante notario.',
    },
    {
      authorId: a1.id,
      at: daysFromNow(-5),
      body: 'Recibido el redline de los estatutos: el inversor pide mayorías reforzadas y un derecho de arrastre (drag-along).',
    },
    {
      authorId: admin.id,
      at: daysFromNow(-1),
      body: 'Falta la certificación bancaria del desembolso para poder elevar a público.',
    },
  ]);

  // ── Documentos + REDLINE (estatutos sociales) ─────────────────────────────────
  const statV1 = [
    'ESTATUTOS SOCIALES — TEXTO REFUNDIDO',
    'Artículo 5. Capital social. El capital social es de CIEN MIL EUROS (100.000 €), dividido en 10.000 participaciones de 10 € cada una.',
    'Artículo 12. Adopción de acuerdos. Los acuerdos se adoptarán por mayoría ordinaria del capital presente o representado.',
    'Artículo 14. Transmisión de participaciones. La transmisión voluntaria por actos inter vivos queda sujeta al derecho de adquisición preferente de los socios.',
    'Artículo 18. Órgano de administración. La sociedad se regirá por un administrador único.',
  ].join('\n\n');
  const statV2 = [
    'ESTATUTOS SOCIALES — TEXTO REFUNDIDO',
    'Artículo 5. Capital social. El capital social es de CIENTO VEINTE MIL EUROS (120.000 €), dividido en 12.000 participaciones de 10 € cada una, tras la ampliación.',
    'Artículo 12. Adopción de acuerdos. Los acuerdos ordinarios se adoptarán por mayoría; las materias reservadas (modificaciones estructurales, endeudamiento relevante) exigirán mayoría reforzada del 75%.',
    'Artículo 14. Transmisión de participaciones. Se mantiene el derecho de adquisición preferente y se añaden derechos de acompañamiento (tag-along) y de arrastre (drag-along).',
    'Artículo 18. Órgano de administración. La sociedad se regirá por un Consejo de Administración de tres miembros, uno de ellos dominical.',
  ].join('\n\n');
  const statutes = await createDocument(prisma, storage, tenant, dealMatter, {
    name: 'Estatutos sociales (texto refundido)',
    versions: [
      {
        kind: 'text',
        text: statV1,
        reviewStatus: 'APPROVED',
        reviewerId: admin.id,
        uploadedById: a1.id,
        at: monthsAgo(2, 20),
        reviewComment: 'Texto vigente pre-ampliación.',
      },
      {
        kind: 'text',
        text: statV2,
        reviewStatus: 'CHANGES_REQUESTED',
        reviewerId: admin.id,
        uploadedById: a1.id,
        at: daysFromNow(-5),
        reviewComment: 'Redline del inversor: mayorías reforzadas, drag/tag y consejo.',
      },
    ],
  });
  await createDocument(prisma, storage, tenant, dealMatter, {
    name: 'Pacto de socios',
    versions: [
      {
        kind: 'pdf',
        title: 'Pacto de socios',
        paragraphs: [
          'Gobernanza y composición del consejo.',
          'Materias reservadas y mayorías reforzadas.',
          'Derechos de tag-along y drag-along.',
          'Política de dividendos y desinversión.',
        ],
        reviewStatus: 'IN_REVIEW',
        uploadedById: admin.id,
        at: daysFromNow(-5),
      },
    ],
  });

  // ── Data room (vendor DD de la ampliación) ────────────────────────────────────
  const dr = await createDataRoom(prisma, storage, tenant, dealMatter, {
    name: 'Data room · Ampliación de capital Meridiano',
    folders: [
      { key: 'corp', name: '01 · Corporativo' },
      { key: 'cta', name: '02 · Cuentas y financiero' },
      { key: 'con', name: '03 · Contratos relevantes' },
      { key: 'lab', name: '04 · Laboral' },
    ],
    documents: [
      {
        folderKey: 'corp',
        name: 'Estatutos vigentes.pdf',
        title: 'Estatutos sociales vigentes',
        uploadedById: a1.id,
      },
      {
        folderKey: 'corp',
        name: 'Actas de los ultimos 3 ejercicios.pdf',
        title: 'Actas de los últimos 3 ejercicios',
        uploadedById: a1.id,
      },
      {
        folderKey: 'corp',
        name: 'Libro registro de socios.pdf',
        title: 'Libro registro de socios',
        uploadedById: admin.id,
      },
      {
        folderKey: 'cta',
        name: 'Cuentas anuales 2024.pdf',
        title: 'Cuentas anuales 2024 depositadas',
        uploadedById: a2.id,
      },
      {
        folderKey: 'cta',
        name: 'Plan de negocio 2026-2028.pdf',
        title: 'Plan de negocio 2026-2028',
        uploadedById: a2.id,
      },
      {
        folderKey: 'con',
        name: 'Contratos con clientes clave.pdf',
        title: 'Contratos con clientes clave',
        uploadedById: a1.id,
      },
      {
        folderKey: 'lab',
        name: 'Relacion de plantilla.pdf',
        title: 'Relación de plantilla y altos cargos',
        uploadedById: a1.id,
      },
    ],
    grant: {
      email: 'dd@brujulaventures.demo',
      name: 'Asesores del inversor (Brújula Ventures)',
      canDownload: true,
      folderKeys: ['corp', 'cta', 'con'],
      expiresAt: daysFromNow(20),
      lastAccessAt: daysFromNow(-2),
      createdById: admin.id,
    },
    accessLogs: [
      { action: 'VIEW_ROOM', at: daysFromNow(-6) },
      { action: 'DOWNLOAD', at: daysFromNow(-5) },
      { action: 'VIEW_DOC', at: daysFromNow(-2) },
    ],
    questions: [
      {
        folderKey: 'cta',
        body: '¿La proyección 2026 contempla la inversión en el nuevo almacén logístico?',
        answer:
          'Sí, el plan de negocio incluye el CAPEX del almacén (450.000 €) financiado en parte con la ampliación.',
        answeredById: admin.id,
        at: daysFromNow(-5),
        answeredAt: daysFromNow(-4),
      },
      {
        folderKey: 'corp',
        body: '¿Existe algún pacto parasocial previo entre los socios actuales?',
        at: daysFromNow(-2),
      },
    ],
  });

  // ── Checklist de cierre de la ampliación ──────────────────────────────────────
  await createClosingChecklist(prisma, tenant, dealMatter, {
    title: 'Checklist de cierre — Ampliación de capital Meridiano',
    closingDate: daysFromNow(12),
    items: [
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Acuerdo de junta de ampliación de capital',
        status: 'SATISFIED',
        responsibleParty: 'Sociedad',
        dueDate: daysFromNow(-20),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Renuncia al derecho de suscripción preferente de los socios',
        status: 'SATISFIED',
        responsibleParty: 'Socios',
        dueDate: daysFromNow(-14),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Desembolso íntegro y certificación bancaria',
        status: 'IN_PROGRESS',
        responsibleParty: 'Inversor',
        dueDate: daysFromNow(4),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Due diligence sin hallazgos materiales',
        status: 'PENDING',
        responsibleParty: 'Inversor',
        dueDate: daysFromNow(6),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Autorización de la entidad financiera (cláusula de cambio de control)',
        status: 'WAIVED',
        detail: 'La financiación no contiene cláusula de cambio de control.',
        responsibleParty: 'Despacho',
      },
      {
        category: 'DELIVERABLE',
        title: 'Estatutos refundidos en versión de firma',
        status: 'IN_PROGRESS',
        responsibleParty: 'Despacho',
        documentId: statutes.document.id,
        dueDate: daysFromNow(8),
      },
      {
        category: 'DELIVERABLE',
        title: 'Pacto de socios firmado',
        status: 'PENDING',
        responsibleParty: 'Ambas partes',
        dueDate: daysFromNow(10),
      },
      {
        category: 'SIGNATURE_PAGE',
        title: 'Escritura de ampliación ante notario',
        status: 'PENDING',
        responsibleParty: 'Ambas partes',
        dueDate: daysFromNow(12),
      },
      {
        category: 'SIGNATURE_PAGE',
        title: 'Inscripción en el Registro Mercantil',
        status: 'PENDING',
        responsibleParty: 'Despacho',
        dueDate: daysFromNow(20),
      },
    ],
  });

  // ── Hoja de encargo ───────────────────────────────────────────────────────────
  await createEngagementLetter(prisma, storage, tenant, dealMatter, {
    scope:
      'Asesoramiento en la entrada de un socio inversor en Distribuidora Meridiano, S.L. mediante ampliación de capital: junta, modificación de estatutos, pacto de socios, due diligence vendor, escritura de ampliación e inscripción registral.',
    fees: 'Honorarios de 24.000 € + gastos e impuestos. Provisión de fondos de 10.000 €. IVA no incluido.',
    terms:
      'Facturación 50% al inicio y 50% al cierre. Suplidos (notaría y registro) previa provisión.',
    generatedById: admin.id,
    at: monthsAgo(3, 5),
  });

  // ── Tareas + plazo procesal (impugnación de acuerdos) ─────────────────────────
  await addTask(prisma, tenant, dealMatter, {
    title: 'Obtener la certificación bancaria del desembolso',
    status: 'IN_PROGRESS',
    dueDate: daysFromNow(4),
    assigneeId: admin.id,
  });
  await addTask(prisma, tenant, dealMatter, {
    title: 'Cerrar el redline de estatutos (mayorías y drag-along)',
    status: 'IN_PROGRESS',
    dueDate: daysFromNow(6),
    assigneeId: a1.id,
  });
  await addTask(prisma, tenant, secMatter, {
    title: 'Presentar la declaración de titularidad real',
    status: 'TODO',
    dueDate: daysFromNow(25),
    assigneeId: a2.id,
  });
  await addTask(prisma, tenant, secMatter, {
    title: 'Inscribir la ampliación de capital en el Registro Mercantil',
    status: 'TODO',
    dueDate: daysFromNow(8),
    assigneeId: a1.id,
  });
  // Un socio minoritario impugna el acuerdo de ampliación: plazo de contestación computado.
  await addProceduralDeadline(prisma, tenant, dealMatter, {
    title: 'Contestación a la demanda de impugnación de acuerdos sociales',
    deadlineType: 'Contestación a la demanda',
    days: 20,
    receivedAt: daysFromNow(-5),
    court: 'Juzgado de lo Mercantil nº 3 de Madrid',
    procedureRef: 'Procedimiento ordinario 712/2026',
    actType: 'Decreto de admisión a trámite',
    subject:
      'Impugnación por un socio minoritario del acuerdo de ampliación de capital (dilución).',
    assigneeId: admin.id,
    createdById: admin.id,
  });

  // ── Partes de horas ─────────────────────────────────────────────────────────--
  await addTimeEntries(prisma, tenant, dealMatter, [
    {
      userId: admin.id,
      description: 'Preparación de la junta de ampliación y orden del día',
      minutes: 150,
      hourlyRate: 220,
      billed: true,
      workedAt: monthsAgo(1, 16),
    },
    {
      userId: a1.id,
      description: 'Redacción de estatutos y pacto de socios',
      minutes: 300,
      hourlyRate: 160,
      billed: true,
      workedAt: monthsAgo(1, 8),
    },
    {
      userId: a1.id,
      description: 'Negociación del redline de estatutos con el inversor',
      minutes: 180,
      hourlyRate: 160,
      billed: false,
      workedAt: daysFromNow(-5),
    },
    {
      userId: a2.id,
      description: 'Coordinación de la due diligence vendor',
      minutes: 200,
      hourlyRate: 150,
      billed: false,
      workedAt: daysFromNow(-3),
    },
    {
      userId: admin.id,
      description: 'Gestión de la impugnación del socio minoritario',
      minutes: 120,
      hourlyRate: 220,
      billed: false,
      workedAt: daysFromNow(-2),
    },
  ]);

  // ── Facturas (Verifactu EUR + e-CF DOP, sandbox) ──────────────────────────────
  const chain = new Map();
  let seq = 1;
  const due = (issue, days) => {
    const d = new Date(issue);
    d.setDate(d.getDate() + days);
    return d;
  };
  const f1 = monthsAgo(3, 5);
  await issueInvoice(prisma, {
    tenant,
    client: company,
    matter: dealMatter,
    format: 'es',
    currency: 'EUR',
    seq: seq++,
    chain,
    issueDate: f1,
    dueDate: due(f1, 30),
    state: 'PAID',
    withholdingTaxCode: 'IRPF_GENERAL',
    lines: [
      {
        description: 'Honorarios — inicio de la operación (50%)',
        quantity: 1,
        unitPrice: '12000.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  const f2 = monthsAgo(4, 1);
  await issueInvoice(prisma, {
    tenant,
    client: company,
    matter: secMatter,
    format: 'es',
    currency: 'EUR',
    seq: seq++,
    chain,
    issueDate: f2,
    dueDate: due(f2, 30),
    state: 'PAID',
    withholdingTaxCode: 'IRPF_GENERAL',
    lines: [
      {
        description: 'Iguala de secretaría de sociedades (trimestre)',
        quantity: 1,
        unitPrice: '2250.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  const f3 = monthsAgo(2, 2);
  const overdue = await issueInvoice(prisma, {
    tenant,
    client: company2,
    matter: await createMatter(prisma, tenant, {
      reference: 'MC-2026-014',
      title: 'Asesoramiento mercantil recurrente — Talento Digital',
      type: 'Mercantil · Asesoría',
      status: 'OPEN',
      clientId: company2.id,
      lawyerId: a2.id,
    }),
    format: 'es',
    currency: 'EUR',
    seq: seq++,
    chain,
    issueDate: f3,
    dueDate: due(f3, 30),
    state: 'OVERDUE',
    withholdingTaxCode: 'IRPF_GENERAL',
    lines: [
      {
        description: 'Honorarios — modificación de estatutos',
        quantity: 1,
        unitPrice: '3200.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  await addDunningReminder(prisma, tenant, overdue.invoice, 1, 'REMINDER');
  await addDunningReminder(prisma, tenant, overdue.invoice, 7, 'WARNING');
  // Sociedad dominicana en cartera (e-CF / DOP).
  const doMatter = await createMatter(prisma, tenant, {
    reference: 'MC-2026-018',
    title: 'Constitución y gobierno corporativo — Antillas Trading (RD)',
    type: 'Mercantil · Constitución (RD)',
    status: 'IN_PROGRESS',
    clientId: doCompany.id,
    lawyerId: a1.id,
    budgetAmount: '8000.00',
  });
  const f4 = monthsAgo(1, 6);
  await issueInvoice(prisma, {
    tenant,
    client: doCompany,
    matter: doMatter,
    format: 'do',
    currency: 'DOP',
    seq: seq++,
    chain,
    issueDate: f4,
    dueDate: due(f4, 30),
    state: 'ISSUED',
    lines: [
      {
        description: 'Honorarios — constitución de SRL y estatutos (RD)',
        quantity: 1,
        unitPrice: '150000.00',
        taxCode: 'ITBIS_STANDARD',
      },
    ],
  });

  // ── Leads ───────────────────────────────────────────────────────────────────--
  await addLeads(prisma, tenant, [
    {
      name: 'Cooperativa Agraria del Tajo',
      company: 'Coop. Agraria del Tajo',
      email: 'gerencia@cooptajo.demo',
      subject: 'Transformación en sociedad limitada',
      source: 'referido',
      status: 'QUALIFIED',
      estimatedValue: '15000.00',
      assignedToId: admin.id,
      at: daysFromNow(-7),
    },
    {
      name: 'Startup Nimbus',
      company: 'Nimbus Cloud',
      email: 'founders@nimbus.demo',
      subject: 'Pacto de socios y stock options',
      source: 'web',
      status: 'CONTACTED',
      estimatedValue: '12000.00',
      assignedToId: a1.id,
      at: daysFromNow(-4),
    },
    {
      name: 'Grupo Familiar Roca',
      company: 'Inversiones Roca',
      email: 'family@roca.demo',
      subject: 'Protocolo familiar y holding',
      source: 'intake',
      status: 'NEW',
      estimatedValue: '22000.00',
      at: daysFromNow(-2),
    },
    {
      name: 'Editorial Candil',
      company: 'Editorial Candil',
      email: 'admin@candil.demo',
      subject: 'Secretaría de sociedades externalizada',
      source: 'manual',
      status: 'NEW',
      estimatedValue: '9000.00',
      at: daysFromNow(-1),
    },
    {
      name: 'Bodegas del Páramo',
      company: 'Bodegas del Páramo',
      email: 'info@bparamo.demo',
      subject: 'Entrada de fondo de inversión',
      source: 'intake',
      status: 'LOST',
      notes: 'La operación se cayó por valoración.',
      at: daysFromNow(-18),
    },
  ]);

  return { tenant, counts: { clients: 5, matters: 5, invoices: seq - 1, dataRoomToken: dr.grant } };
}
