/**
 * ESCENARIO 1 — Boutique de M&A: compraventa del 100 % de las participaciones de una sociedad,
 * a MEDIO CIERRE. Operación viva: data room de DD abierto a los asesores del comprador, SPA con
 * redline, checklist de cierre con condiciones previas mixtas, hoja de encargo, honorarios facturados
 * (Verifactu) más una factura e-CF a un inversor dominicano (sandbox). Todo ficticio.
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
import { issueInvoice } from '../lib/fiscal.mjs';
import { nif, cif, rnc } from '../lib/identifiers.mjs';
import { monthsAgo, daysFromNow } from '../lib/env.mjs';

export async function seed(prisma, storage, cfg) {
  const { tenant, admin, lawyers } = await provisionTenant(prisma, cfg);
  const [a1, a2] = lawyers;

  // ── Clientes ────────────────────────────────────────────────────────────────
  // El comprador es nuestro cliente (compra el 100 %); también su vehículo inversor y un inversor DO.
  const target = await createClient(prisma, tenant, {
    name: 'Helios Renovables, S.L.',
    taxId: cif(4410101),
    taxIdKind: 'CIF',
    email: 'finanzas@helios-renovables.demo',
    phone: '+34 915 552 011',
    address: 'C/ Génova 17, 28004 Madrid',
    kyc: { risk: 'MEDIUM' },
  });
  const buyer = await createClient(prisma, tenant, {
    name: 'Atlas Capital Partners, S.L.',
    taxId: cif(5510111),
    taxIdKind: 'CIF',
    email: 'deals@atlascapital.demo',
    phone: '+34 915 552 022',
    address: 'Pº de la Castellana 120, 28046 Madrid',
    kyc: { risk: 'LOW' },
  });
  const founder = await createClient(prisma, tenant, {
    name: 'Ricardo Bermúdez Calleja',
    taxId: nif(50112233),
    taxIdKind: 'NIF',
    email: 'r.bermudez@correo.demo',
    phone: '+34 660 110 220',
    address: 'C/ Velázquez 45, 28001 Madrid',
  });
  const doInvestor = await createClient(prisma, tenant, {
    name: 'Inversiones Quisqueya del Este, SRL',
    taxId: rnc(13405067),
    taxIdKind: 'RNC',
    email: 'aportes@quisqueyaeste.demo',
    phone: '+1 809 555 0140',
    address: 'Av. Winston Churchill 1099, Santo Domingo',
    kyc: { risk: 'MEDIUM' },
  });
  const sideClient = await createClient(prisma, tenant, {
    name: 'NovaTech Software, S.L.',
    taxId: cif(3310121),
    taxIdKind: 'CIF',
    email: 'legal@novatech.demo',
    phone: '+34 915 552 033',
    address: 'C/ Príncipe de Vergara 80, 28006 Madrid',
  });

  // ── Expediente principal de la operación ──────────────────────────────────────
  const matter = await createMatter(prisma, tenant, {
    reference: 'QM-2026-014',
    title: 'Compraventa del 100% de Helios Renovables, S.L.',
    type: 'M&A · Compraventa de participaciones',
    status: 'IN_PROGRESS',
    clientId: buyer.id,
    lawyerId: admin.id,
    budgetAmount: '145000.00',
    opposingParty: 'Vendedores — familia Bermúdez (socios actuales de Helios)',
    opposingPartyTaxId: nif(50112233),
    opposingCounsel: 'Garrido-Lema Abogados (letrado de la parte vendedora)',
    proceduralPhase: 'Signing pendiente · condiciones previas en curso',
    openedAt: monthsAgo(4, 8),
    retainer: '30000.00',
  });

  // ── Timeline de actividad ─────────────────────────────────────────────────────
  await addActivity(prisma, tenant, matter, admin.id, [
    {
      action: 'matter.opened',
      at: monthsAgo(4, 8),
      metadata: { hito: 'Apertura del expediente y conflict check' },
    },
    {
      action: 'document.signed',
      at: monthsAgo(4, 12),
      metadata: { hito: 'NDA firmado con la parte vendedora' },
    },
    {
      action: 'document.signed',
      at: monthsAgo(3, 5),
      metadata: { hito: 'Carta de intenciones (LOI) firmada' },
    },
    {
      action: 'dataroom.opened',
      at: monthsAgo(3, 9),
      metadata: { hito: 'Apertura del data room de due diligence' },
    },
    {
      action: 'document.version.uploaded',
      at: monthsAgo(1, 18),
      metadata: { hito: 'Primer borrador del SPA distribuido' },
    },
    {
      action: 'document.version.uploaded',
      at: daysFromNow(-6),
      metadata: { hito: 'Redline del SPA recibido del comprador' },
    },
    {
      action: 'closing.item.updated',
      at: daysFromNow(-2),
      metadata: { hito: 'Condiciones previas: 2 de 5 cumplidas' },
    },
  ]);
  await addMessages(prisma, tenant, matter, [
    {
      authorId: admin.id,
      at: monthsAgo(1, 18),
      body: 'Distribuido el borrador del SPA. Pendiente recibir comentarios del comprador antes del viernes.',
    },
    {
      authorId: a1.id,
      at: daysFromNow(-6),
      body: 'Recibido el redline. El comprador endurece las manifestaciones y garantías fiscales y mete un cap del 15%.',
    },
    {
      authorId: admin.id,
      at: daysFromNow(-2),
      body: 'Cerrada la cláusula de earn-out. Falta el waiver del derecho de adquisición preferente de un socio minoritario.',
    },
  ]);

  // ── Documentos + REDLINE visible (SPA v1 vs v2) ───────────────────────────────
  const spaV1 = [
    'CONTRATO DE COMPRAVENTA DE PARTICIPACIONES SOCIALES',
    'PRIMERA. Objeto. El Vendedor vende y el Comprador adquiere el 100% de las participaciones de Helios Renovables, S.L.',
    'SEGUNDA. Precio. El precio de compraventa asciende a CUATRO MILLONES DOSCIENTOS MIL EUROS (4.200.000 €), pagaderos al cierre.',
    'TERCERA. Manifestaciones y garantías. El Vendedor manifiesta que las cuentas reflejan la imagen fiel del patrimonio.',
    'CUARTA. Responsabilidad. La responsabilidad del Vendedor por incumplimiento de las garantías no tendrá límite cuantitativo.',
    'QUINTA. Condiciones suspensivas. El cierre queda condicionado a la autorización de la junta y al consentimiento del banco.',
  ].join('\n\n');
  const spaV2 = [
    'CONTRATO DE COMPRAVENTA DE PARTICIPACIONES SOCIALES',
    'PRIMERA. Objeto. El Vendedor vende y el Comprador adquiere el 100% de las participaciones de Helios Renovables, S.L.',
    'SEGUNDA. Precio. El precio de compraventa asciende a CUATRO MILLONES EUROS (4.000.000 €), pagaderos 3.400.000 € al cierre y 600.000 € como earn-out a 24 meses.',
    'TERCERA. Manifestaciones y garantías. El Vendedor manifiesta que las cuentas reflejan la imagen fiel del patrimonio y que no existen contingencias fiscales ocultas.',
    'CUARTA. Responsabilidad. La responsabilidad del Vendedor por incumplimiento de las garantías queda limitada al 15% del precio (cap), con un de minimis de 25.000 €.',
    'QUINTA. Condiciones suspensivas. El cierre queda condicionado a la autorización de la junta, al consentimiento del banco y al waiver del derecho de adquisición preferente.',
  ].join('\n\n');
  const spa = await createDocument(prisma, storage, tenant, matter, {
    name: 'SPA — Contrato de compraventa de participaciones',
    versions: [
      {
        kind: 'text',
        text: spaV1,
        reviewStatus: 'APPROVED',
        reviewerId: admin.id,
        uploadedById: a1.id,
        at: monthsAgo(1, 18),
        reviewComment: 'Borrador inicial conforme.',
      },
      {
        kind: 'text',
        text: spaV2,
        reviewStatus: 'CHANGES_REQUESTED',
        reviewerId: admin.id,
        uploadedById: a1.id,
        at: daysFromNow(-6),
        reviewComment: 'Redline del comprador: revisar cap y earn-out.',
      },
    ],
  });
  await createDocument(prisma, storage, tenant, matter, {
    name: 'Carta de intenciones (LOI)',
    versions: [
      {
        kind: 'pdf',
        title: 'Carta de intenciones',
        paragraphs: [
          'Términos no vinculantes de la operación.',
          'Exclusividad de 90 días.',
          'Estructura: compraventa del 100% de participaciones.',
        ],
        reviewStatus: 'APPROVED',
        reviewerId: admin.id,
        uploadedById: admin.id,
        at: monthsAgo(3, 5),
      },
    ],
  });
  const ddReport = await createDocument(prisma, storage, tenant, matter, {
    name: 'Informe de due diligence legal (vendor)',
    versions: [
      {
        kind: 'pdf',
        title: 'Informe de due diligence legal',
        paragraphs: [
          'Resumen ejecutivo de contingencias.',
          'Áreas: societario, laboral, fiscal, contratos, litigios.',
          'Hallazgos relevantes: 1 litigio laboral menor; 2 contratos con cambio de control.',
        ],
        reviewStatus: 'IN_REVIEW',
        uploadedById: a2.id,
        at: monthsAgo(2, 14),
      },
    ],
  });

  // ── Data room ─────────────────────────────────────────────────────────────────
  const dr = await createDataRoom(prisma, storage, tenant, matter, {
    name: 'Data room · Project Helios',
    folders: [
      { key: 'corp', name: '01 · Corporativo' },
      { key: 'fin', name: '02 · Financiero' },
      { key: 'lab', name: '03 · Laboral' },
      { key: 'con', name: '04 · Contratos' },
      { key: 'lit', name: '05 · Litigios y contingencias' },
    ],
    documents: [
      {
        folderKey: 'corp',
        name: 'Escritura de constitución.pdf',
        title: 'Escritura de constitución',
        uploadedById: admin.id,
      },
      {
        folderKey: 'corp',
        name: 'Estatutos vigentes.pdf',
        title: 'Estatutos sociales vigentes',
        uploadedById: admin.id,
      },
      {
        folderKey: 'corp',
        name: 'Libro registro de socios.pdf',
        title: 'Libro registro de socios',
        uploadedById: a1.id,
      },
      {
        folderKey: 'fin',
        name: 'Cuentas auditadas 2024.pdf',
        title: 'Cuentas anuales auditadas 2024',
        uploadedById: a2.id,
      },
      {
        folderKey: 'fin',
        name: 'Cuentas auditadas 2025.pdf',
        title: 'Cuentas anuales auditadas 2025',
        uploadedById: a2.id,
      },
      {
        folderKey: 'lab',
        name: 'Plantilla y contratos clave.pdf',
        title: 'Relación de plantilla y contratos clave',
        uploadedById: a1.id,
      },
      {
        folderKey: 'con',
        name: 'Contratos con cambio de control.pdf',
        title: 'Contratos con cláusula de cambio de control',
        uploadedById: a1.id,
      },
      {
        folderKey: 'lit',
        name: 'Estado de litigios.pdf',
        title: 'Estado de litigios y contingencias',
        uploadedById: a2.id,
      },
    ],
    grant: {
      email: 'dd@atlascapital.demo',
      name: 'Asesores del comprador (Atlas Capital)',
      canDownload: true,
      // Acceso restringido: NO ve la carpeta de litigios todavía.
      folderKeys: ['corp', 'fin', 'lab', 'con'],
      expiresAt: daysFromNow(30),
      lastAccessAt: daysFromNow(-1),
      createdById: admin.id,
    },
    accessLogs: [
      { action: 'VIEW_ROOM', at: daysFromNow(-3) },
      { action: 'VIEW_DOC', at: daysFromNow(-3) },
      { action: 'DOWNLOAD', at: daysFromNow(-2) },
      { action: 'VIEW_DOC', at: daysFromNow(-1) },
    ],
    questions: [
      {
        folderKey: 'fin',
        body: '¿Pueden confirmar si la deuda financiera neta a cierre de 2025 incluye el leasing de la nave?',
        answer:
          'Sí, el leasing de la nave (240.000 €) está incluido en la deuda financiera neta. Ver nota 12 de la memoria.',
        answeredById: admin.id,
        at: daysFromNow(-3),
        answeredAt: daysFromNow(-2),
      },
      {
        folderKey: 'lab',
        body: '¿Existen pactos de blindaje (golden parachutes) con el equipo directivo?',
        answer: 'No. No hay cláusulas de blindaje; los contratos de alta dirección son ordinarios.',
        answeredById: a1.id,
        at: daysFromNow(-2),
        answeredAt: daysFromNow(-1),
      },
      {
        folderKey: 'con',
        body: '¿Cuántos de los contratos con cambio de control requieren consentimiento expreso de la contraparte?',
        at: daysFromNow(-1),
      },
    ],
  });

  // ── Checklist de cierre (condiciones previas mixtas) ──────────────────────────
  await createClosingChecklist(prisma, tenant, matter, {
    title: 'Checklist de cierre — Project Helios',
    closingDate: daysFromNow(21),
    items: [
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Autorización de la junta general del vendedor',
        status: 'SATISFIED',
        responsibleParty: 'Vendedor',
        dueDate: daysFromNow(-10),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Certificado de cargas y gravámenes actualizado',
        status: 'SATISFIED',
        responsibleParty: 'Despacho',
        dueDate: daysFromNow(-5),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Waiver del derecho de adquisición preferente del socio minoritario',
        status: 'IN_PROGRESS',
        responsibleParty: 'Vendedor',
        dueDate: daysFromNow(7),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Consentimiento del banco al cambio de control',
        status: 'PENDING',
        responsibleParty: 'Comprador',
        dueDate: daysFromNow(14),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Autorización de competencia (CNMC)',
        status: 'WAIVED',
        detail: 'Operación por debajo de umbrales de notificación.',
        responsibleParty: 'Despacho',
      },
      {
        category: 'DELIVERABLE',
        title: 'SPA en versión de firma',
        status: 'IN_PROGRESS',
        responsibleParty: 'Despacho',
        documentId: spa.document.id,
        dueDate: daysFromNow(18),
      },
      {
        category: 'DELIVERABLE',
        title: 'Pacto de socios',
        status: 'PENDING',
        responsibleParty: 'Ambas partes',
        dueDate: daysFromNow(18),
      },
      {
        category: 'DELIVERABLE',
        title: 'Cuentas auditadas 2025 (bring-down)',
        status: 'SATISFIED',
        responsibleParty: 'Vendedor',
        documentId: ddReport.document.id,
      },
      {
        category: 'SIGNATURE_PAGE',
        title: 'Hoja de firmas del SPA',
        status: 'PENDING',
        responsibleParty: 'Ambas partes',
        dueDate: daysFromNow(21),
      },
      {
        category: 'SIGNATURE_PAGE',
        title: 'Poderes notariales de los firmantes',
        status: 'PENDING',
        responsibleParty: 'Ambas partes',
        dueDate: daysFromNow(20),
      },
    ],
  });

  // ── Hoja de encargo ───────────────────────────────────────────────────────────
  await createEngagementLetter(prisma, storage, tenant, matter, {
    scope:
      'Asesoramiento integral en la adquisición del 100% de Helios Renovables, S.L.: due diligence legal, negociación y redacción del SPA y del pacto de socios, gestión de condiciones previas y asistencia al cierre (signing y closing).',
    fees: 'Honorarios fijos de 120.000 € + 25.000 € de éxito al cierre (success fee). Provisión de fondos inicial de 30.000 €. IVA no incluido.',
    terms:
      'Facturación por hitos. Gastos y suplidos aparte. Confidencialidad y conflicto de intereses conforme a la normativa colegial.',
    generatedById: admin.id,
    at: monthsAgo(4, 9),
  });

  // ── Tareas (próximas) + plazo procesal computado ──────────────────────────────
  await addTask(prisma, tenant, matter, {
    title: 'Cotejar el redline del SPA y preparar contrapropuesta',
    status: 'IN_PROGRESS',
    dueDate: daysFromNow(3),
    assigneeId: a1.id,
  });
  await addTask(prisma, tenant, matter, {
    title: 'Recabar el waiver del derecho de adquisición preferente',
    status: 'TODO',
    dueDate: daysFromNow(7),
    assigneeId: admin.id,
  });
  await addTask(prisma, tenant, matter, {
    title: 'Preparar el bible de firma y los poderes',
    status: 'TODO',
    dueDate: daysFromNow(18),
    assigneeId: a2.id,
  });
  // Contingencia litigiosa identificada en DD (litigio laboral): plazo procesal real computado.
  await addProceduralDeadline(prisma, tenant, matter, {
    title: 'Contestación a la demanda — contingencia laboral de Helios',
    deadlineType: 'Contestación a la demanda',
    days: 20,
    receivedAt: daysFromNow(-4),
    court: 'Juzgado de lo Social nº 12 de Madrid',
    procedureRef: 'Autos 318/2026',
    actType: 'Decreto de admisión a trámite',
    subject:
      'Demanda por despido de un trabajador de la sociedad objetivo (riesgo asumido en el SPA).',
    assigneeId: a2.id,
    createdById: admin.id,
  });

  // ── Partes de horas (facturables; con bolsa SIN facturar → alerta) ────────────
  await addTimeEntries(prisma, tenant, matter, [
    {
      userId: admin.id,
      description: 'Negociación del SPA con la parte vendedora',
      minutes: 240,
      hourlyRate: 320,
      billed: true,
      workedAt: monthsAgo(1, 20),
    },
    {
      userId: a1.id,
      description: 'Revisión de la due diligence financiera',
      minutes: 300,
      hourlyRate: 210,
      billed: true,
      workedAt: monthsAgo(2, 10),
    },
    {
      userId: a1.id,
      description: 'Análisis del redline y manifestaciones y garantías',
      minutes: 180,
      hourlyRate: 210,
      billed: false,
      workedAt: daysFromNow(-6),
    },
    {
      userId: a2.id,
      description: 'Preparación del checklist de cierre y condiciones previas',
      minutes: 150,
      hourlyRate: 190,
      billed: false,
      workedAt: daysFromNow(-3),
    },
    {
      userId: admin.id,
      description: 'Reunión de coordinación con asesores del comprador',
      minutes: 90,
      hourlyRate: 320,
      billed: false,
      workedAt: daysFromNow(-1),
    },
  ]);

  // ── Facturas (Verifactu EUR + e-CF DOP, sandbox) repartidas en el tiempo ──────-
  const chain = new Map();
  let seq = 1;
  const due = (issue, days) => {
    const d = new Date(issue);
    d.setDate(d.getDate() + days);
    return d;
  };
  // Provisión de honorarios (pagada).
  const i1Issue = monthsAgo(4, 10);
  await issueInvoice(prisma, {
    tenant,
    client: buyer,
    matter,
    format: 'es',
    currency: 'EUR',
    seq: seq++,
    chain,
    issueDate: i1Issue,
    dueDate: due(i1Issue, 30),
    state: 'PAID',
    withholdingTaxCode: 'IRPF_GENERAL',
    lines: [
      {
        description: 'Provisión de fondos — operación Helios',
        quantity: 1,
        unitPrice: '30000.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  // Hito DD (pagada).
  const i2Issue = monthsAgo(2, 12);
  await issueInvoice(prisma, {
    tenant,
    client: buyer,
    matter,
    format: 'es',
    currency: 'EUR',
    seq: seq++,
    chain,
    issueDate: i2Issue,
    dueDate: due(i2Issue, 30),
    state: 'PAID',
    withholdingTaxCode: 'IRPF_GENERAL',
    lines: [
      {
        description: 'Honorarios — fase de due diligence',
        quantity: 1,
        unitPrice: '45000.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  // Hito negociación (VENCIDA → dispara dunning).
  const i3Issue = monthsAgo(2, 2);
  const overdue = await issueInvoice(prisma, {
    tenant,
    client: buyer,
    matter,
    format: 'es',
    currency: 'EUR',
    seq: seq++,
    chain,
    issueDate: i3Issue,
    dueDate: due(i3Issue, 30),
    state: 'OVERDUE',
    withholdingTaxCode: 'IRPF_GENERAL',
    lines: [
      {
        description: 'Honorarios — negociación del SPA',
        quantity: 1,
        unitPrice: '30000.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  await addDunningReminder(prisma, tenant, overdue.invoice, 1, 'REMINDER');
  await addDunningReminder(prisma, tenant, overdue.invoice, 7, 'WARNING');
  // Asunto lateral facturado a otro cliente (ES, emitida).
  const i4Issue = monthsAgo(1, 15);
  const sideMatter = await createMatter(prisma, tenant, {
    reference: 'QM-2026-020',
    title: 'Revisión de pacto de socios — NovaTech',
    type: 'Societario',
    status: 'OPEN',
    clientId: sideClient.id,
    lawyerId: a2.id,
    budgetAmount: '12000.00',
  });
  await issueInvoice(prisma, {
    tenant,
    client: sideClient,
    matter: sideMatter,
    format: 'es',
    currency: 'EUR',
    seq: seq++,
    chain,
    issueDate: i4Issue,
    dueDate: due(i4Issue, 30),
    state: 'ISSUED',
    withholdingTaxCode: 'IRPF_GENERAL',
    lines: [
      {
        description: 'Honorarios — revisión de pacto de socios',
        quantity: 1,
        unitPrice: '8000.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  // Factura e-CF (RD / DOP) a un inversor dominicano del consorcio comprador (sandbox, sin transmisión).
  const i5Issue = monthsAgo(1, 5);
  const doMatter = await createMatter(prisma, tenant, {
    reference: 'QM-2026-021',
    title: 'Asesoramiento al co-inversor dominicano — entrada en el consorcio',
    type: 'M&A · Co-inversión',
    status: 'IN_PROGRESS',
    clientId: doInvestor.id,
    lawyerId: admin.id,
  });
  await issueInvoice(prisma, {
    tenant,
    client: doInvestor,
    matter: doMatter,
    format: 'do',
    currency: 'DOP',
    seq: seq++,
    chain,
    issueDate: i5Issue,
    dueDate: due(i5Issue, 30),
    state: 'ISSUED',
    lines: [
      {
        description: 'Honorarios — estructuración de la co-inversión',
        quantity: 1,
        unitPrice: '480000.00',
        taxCode: 'ITBIS_STANDARD',
      },
    ],
  });

  // ── Leads (embudo CRM) ─────────────────────────────────────────────────────────
  await addLeads(prisma, tenant, [
    {
      name: 'Grupo Lácteo Cantábrico, S.A.',
      company: 'Grupo Lácteo Cantábrico',
      email: 'cfo@lacteocantabrico.demo',
      subject: 'Venta de la división de quesos (carve-out)',
      source: 'referido',
      status: 'QUALIFIED',
      estimatedValue: '90000.00',
      assignedToId: admin.id,
      at: daysFromNow(-9),
    },
    {
      name: 'Marina Esteve (BioGen)',
      company: 'BioGen Therapeutics',
      email: 'm.esteve@biogen.demo',
      subject: 'Ronda de financiación serie B',
      source: 'web',
      status: 'CONTACTED',
      estimatedValue: '60000.00',
      assignedToId: a1.id,
      at: daysFromNow(-5),
    },
    {
      name: 'Talleres Hnos. Prado',
      company: 'Talleres Prado',
      email: 'gerencia@talleresprado.demo',
      subject: 'Compra de competidor local',
      source: 'intake',
      status: 'NEW',
      estimatedValue: '25000.00',
      at: daysFromNow(-2),
    },
    {
      name: 'Fondo Aurora SGEIC',
      company: 'Aurora SGEIC',
      email: 'deals@aurorasgeic.demo',
      subject: 'Due diligence de cartera',
      source: 'manual',
      status: 'NEW',
      estimatedValue: '40000.00',
      at: daysFromNow(-1),
    },
    {
      name: 'Construcciones Vega',
      company: 'Construcciones Vega',
      email: 'info@cvega.demo',
      subject: 'Reestructuración societaria',
      source: 'intake',
      status: 'LOST',
      notes: 'Optaron por un despacho con sede local.',
      at: daysFromNow(-20),
    },
  ]);

  return {
    tenant,
    counts: { clients: 6, matters: 3, invoices: seq - 1, dataRoomToken: dr.grant },
  };
}
