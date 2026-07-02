/**
 * ESCENARIO 2 — Despacho inmobiliario: compraventa de un edificio de oficinas con DUE DILIGENCE
 * inmobiliaria EN CURSO (registral, urbanística, técnica, arrendamientos, fiscal). Contrato de arras
 * con redline, data room para la financiadora/compradora, checklist de cierre con condiciones previas
 * mixtas, hoja de encargo, honorarios (Verifactu) + una factura e-CF a un comprador dominicano. Ficticio.
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
  const buyer = await createClient(prisma, tenant, {
    name: 'Patrimonial Almena, S.L.',
    taxId: cif(2210202),
    taxIdKind: 'CIF',
    email: 'inversiones@almena.demo',
    phone: '+34 915 770 010',
    address: 'C/ Núñez de Balboa 35, 28001 Madrid',
    kyc: { risk: 'LOW' },
  });
  const seller = await createClient(prisma, tenant, {
    name: 'Inmobiliaria Torre Sur, S.A.',
    taxId: cif(1110212),
    taxIdKind: 'CIF',
    email: 'ventas@torresur.demo',
    phone: '+34 915 770 020',
    address: 'Av. de Burgos 12, 28036 Madrid',
  });
  const lender = await createClient(prisma, tenant, {
    name: 'Carolina Méndez Arroyo',
    taxId: nif(60223344),
    taxIdKind: 'NIF',
    email: 'c.mendez@correo.demo',
    phone: '+34 661 220 330',
    address: 'C/ Goya 60, 28001 Madrid',
  });
  const doBuyer = await createClient(prisma, tenant, {
    name: 'Caribe Property Investments, SRL',
    taxId: rnc(13507089),
    taxIdKind: 'RNC',
    email: 'legal@caribeproperty.demo',
    phone: '+1 809 555 0210',
    address: 'Av. Abraham Lincoln 502, Santo Domingo',
    kyc: { risk: 'MEDIUM' },
  });

  // ── Expediente principal ──────────────────────────────────────────────────────
  const matter = await createMatter(prisma, tenant, {
    reference: 'SL-2026-031',
    title: 'Compraventa del edificio de oficinas — C/ Acanto 22, Madrid',
    type: 'Inmobiliario · Compraventa de inmueble',
    status: 'IN_PROGRESS',
    clientId: buyer.id,
    lawyerId: admin.id,
    budgetAmount: '38000.00',
    opposingParty: 'Inmobiliaria Torre Sur, S.A. (parte vendedora)',
    opposingPartyTaxId: cif(1110212),
    opposingCounsel: 'Despacho Aranda & Vela (letrado del vendedor)',
    proceduralPhase: 'Due diligence inmobiliaria en curso · arras firmadas',
    openedAt: monthsAgo(2, 12),
    retainer: '12000.00',
  });

  await addActivity(prisma, tenant, matter, admin.id, [
    {
      action: 'matter.opened',
      at: monthsAgo(2, 12),
      metadata: { hito: 'Apertura del expediente de compraventa' },
    },
    {
      action: 'document.signed',
      at: monthsAgo(2, 18),
      metadata: { hito: 'Contrato de arras penitenciales firmado (10% del precio)' },
    },
    {
      action: 'dataroom.opened',
      at: monthsAgo(1, 20),
      metadata: { hito: 'Apertura del data room de DD inmobiliaria' },
    },
    {
      action: 'document.version.uploaded',
      at: daysFromNow(-8),
      metadata: { hito: 'Borrador de escritura de compraventa distribuido' },
    },
    {
      action: 'closing.item.updated',
      at: daysFromNow(-2),
      metadata: { hito: 'Pendiente cancelación de hipoteca del vendedor' },
    },
  ]);
  await addMessages(prisma, tenant, matter, [
    {
      authorId: a1.id,
      at: monthsAgo(1, 10),
      body: 'Nota simple actualizada: consta una hipoteca a favor del banco que el vendedor debe cancelar antes del cierre.',
    },
    {
      authorId: admin.id,
      at: daysFromNow(-8),
      body: 'Distribuido el borrador de escritura. Falta confirmar la situación de los arrendatarios de la planta 3.',
    },
    {
      authorId: a2.id,
      at: daysFromNow(-2),
      body: 'La ITE está en trámite; el técnico estima el certificado favorable para la semana que viene.',
    },
  ]);

  // ── Documentos + REDLINE (contrato de arras / borrador de escritura) ──────────
  const arrasV1 = [
    'CONTRATO DE ARRAS PENITENCIALES',
    'PRIMERA. Objeto. La parte vendedora se obliga a vender el edificio sito en C/ Acanto 22, Madrid (finca registral 12.345).',
    'SEGUNDA. Precio. El precio de compraventa se fija en SEIS MILLONES DE EUROS (6.000.000 €).',
    'TERCERA. Arras. La compradora entrega 600.000 € en concepto de arras penitenciales (art. 1.454 CC).',
    'CUARTA. Plazo. La escritura se otorgará en el plazo de SESENTA días desde la firma.',
    'QUINTA. Cargas. La vendedora manifiesta que la finca está libre de cargas y arrendamientos.',
  ].join('\n\n');
  const arrasV2 = [
    'CONTRATO DE ARRAS PENITENCIALES',
    'PRIMERA. Objeto. La parte vendedora se obliga a vender el edificio sito en C/ Acanto 22, Madrid (finca registral 12.345).',
    'SEGUNDA. Precio. El precio de compraventa se fija en CINCO MILLONES OCHOCIENTOS MIL EUROS (5.800.000 €), tras el ajuste por la ITE.',
    'TERCERA. Arras. La compradora entrega 580.000 € en concepto de arras penitenciales (art. 1.454 CC).',
    'CUARTA. Plazo. La escritura se otorgará en el plazo de NOVENTA días desde la firma, prorrogable por la cancelación de la hipoteca.',
    'QUINTA. Cargas. La vendedora se obliga a cancelar la hipoteca inscrita y a entregar la finca libre de arrendatarios salvo el contrato de la planta 3, que se subroga.',
  ].join('\n\n');
  const arras = await createDocument(prisma, storage, tenant, matter, {
    name: 'Contrato de arras penitenciales',
    versions: [
      {
        kind: 'text',
        text: arrasV1,
        reviewStatus: 'APPROVED',
        reviewerId: admin.id,
        uploadedById: a1.id,
        at: monthsAgo(2, 16),
        reviewComment: 'Borrador inicial.',
      },
      {
        kind: 'text',
        text: arrasV2,
        reviewStatus: 'CHANGES_REQUESTED',
        reviewerId: admin.id,
        uploadedById: a1.id,
        at: daysFromNow(-8),
        reviewComment: 'Ajuste de precio por ITE y subrogación del arrendamiento.',
      },
    ],
  });
  const deed = await createDocument(prisma, storage, tenant, matter, {
    name: 'Borrador de escritura de compraventa',
    versions: [
      {
        kind: 'pdf',
        title: 'Escritura de compraventa (borrador)',
        paragraphs: [
          'Comparecientes y representación.',
          'Descripción de la finca y título.',
          'Precio, forma de pago y cancelación de cargas.',
          'Manifestaciones fiscales (ITP/IVA) y entrega de la posesión.',
        ],
        reviewStatus: 'IN_REVIEW',
        uploadedById: admin.id,
        at: daysFromNow(-8),
      },
    ],
  });
  await createDocument(prisma, storage, tenant, matter, {
    name: 'Informe de due diligence inmobiliaria',
    versions: [
      {
        kind: 'pdf',
        title: 'Informe de DD inmobiliaria',
        paragraphs: [
          'Situación registral: hipoteca pendiente de cancelación.',
          'Situación urbanística: uso de oficinas conforme; sin expedientes de disciplina.',
          'Arrendamientos: 1 contrato vigente (planta 3).',
          'Conclusión: viable con condiciones previas.',
        ],
        reviewStatus: 'APPROVED',
        reviewerId: admin.id,
        uploadedById: a2.id,
        at: monthsAgo(1, 5),
      },
    ],
  });

  // ── Data room ─────────────────────────────────────────────────────────────────
  const dr = await createDataRoom(prisma, storage, tenant, matter, {
    name: 'Data room · DD inmueble C/ Acanto 22',
    folders: [
      { key: 'reg', name: '01 · Registral' },
      { key: 'urb', name: '02 · Urbanístico' },
      { key: 'tec', name: '03 · Técnico (ITE / eficiencia)' },
      { key: 'arr', name: '04 · Arrendamientos' },
      { key: 'fis', name: '05 · Fiscal y tributos' },
    ],
    documents: [
      {
        folderKey: 'reg',
        name: 'Nota simple registral.pdf',
        title: 'Nota simple registral actualizada',
        uploadedById: a1.id,
      },
      {
        folderKey: 'reg',
        name: 'Certificación de cargas.pdf',
        title: 'Certificación de cargas',
        uploadedById: a1.id,
      },
      {
        folderKey: 'urb',
        name: 'Cedula urbanistica.pdf',
        title: 'Cédula urbanística y calificación',
        uploadedById: a2.id,
      },
      {
        folderKey: 'urb',
        name: 'Licencia de actividad.pdf',
        title: 'Licencia de actividad y primera ocupación',
        uploadedById: a2.id,
      },
      {
        folderKey: 'tec',
        name: 'Informe ITE.pdf',
        title: 'Informe de inspección técnica del edificio (ITE)',
        uploadedById: a2.id,
      },
      {
        folderKey: 'tec',
        name: 'Certificado eficiencia energetica.pdf',
        title: 'Certificado de eficiencia energética',
        uploadedById: a2.id,
      },
      {
        folderKey: 'arr',
        name: 'Contrato arrendamiento planta 3.pdf',
        title: 'Contrato de arrendamiento (planta 3)',
        uploadedById: a1.id,
      },
      {
        folderKey: 'fis',
        name: 'Recibos IBI y tasas.pdf',
        title: 'Recibos de IBI y tasas municipales',
        uploadedById: a1.id,
      },
    ],
    grant: {
      email: 'riesgos@bancofinanciador.demo',
      name: 'Entidad financiadora de la compradora',
      canDownload: true,
      folderKeys: ['reg', 'urb', 'tec'],
      expiresAt: daysFromNow(45),
      lastAccessAt: daysFromNow(-2),
      createdById: admin.id,
    },
    accessLogs: [
      { action: 'VIEW_ROOM', at: daysFromNow(-5) },
      { action: 'VIEW_DOC', at: daysFromNow(-5) },
      { action: 'DOWNLOAD', at: daysFromNow(-4) },
      { action: 'VIEW_DOC', at: daysFromNow(-2) },
    ],
    questions: [
      {
        folderKey: 'reg',
        body: '¿En qué plazo se compromete el vendedor a cancelar registralmente la hipoteca?',
        answer:
          'El vendedor cancelará la hipoteca con cargo al precio en el mismo acto de otorgamiento de la escritura (carta de pago del banco en el cierre).',
        answeredById: admin.id,
        at: daysFromNow(-4),
        answeredAt: daysFromNow(-3),
      },
      {
        folderKey: 'tec',
        body: '¿La ITE detecta deficiencias que afecten a la financiación?',
        at: daysFromNow(-1),
      },
    ],
  });

  // ── Checklist de cierre ─────────────────────────────────────────────────────--
  await createClosingChecklist(prisma, tenant, matter, {
    title: 'Checklist de cierre — Compraventa C/ Acanto 22',
    closingDate: daysFromNow(28),
    items: [
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Nota simple y certificación de cargas actualizadas',
        status: 'SATISFIED',
        responsibleParty: 'Despacho',
        dueDate: daysFromNow(-12),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Certificado de eficiencia energética',
        status: 'SATISFIED',
        responsibleParty: 'Vendedor',
        dueDate: daysFromNow(-6),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Cancelación registral de la hipoteca del vendedor',
        status: 'IN_PROGRESS',
        responsibleParty: 'Vendedor',
        dueDate: daysFromNow(10),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'ITE con resultado favorable',
        status: 'PENDING',
        responsibleParty: 'Vendedor',
        dueDate: daysFromNow(7),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Estoppel del arrendatario de la planta 3',
        status: 'PENDING',
        responsibleParty: 'Comprador',
        dueDate: daysFromNow(15),
      },
      {
        category: 'CONDITION_PRECEDENT',
        title: 'Licencia de primera ocupación vigente',
        status: 'WAIVED',
        detail: 'Inmueble en uso continuado; no se exige nueva licencia.',
        responsibleParty: 'Despacho',
      },
      {
        category: 'DELIVERABLE',
        title: 'Escritura de compraventa en versión de firma',
        status: 'IN_PROGRESS',
        responsibleParty: 'Notaría',
        documentId: deed.document.id,
        dueDate: daysFromNow(24),
      },
      {
        category: 'DELIVERABLE',
        title: 'Provisión para ITP/AJD e impuestos',
        status: 'PENDING',
        responsibleParty: 'Comprador',
        dueDate: daysFromNow(24),
      },
      {
        category: 'SIGNATURE_PAGE',
        title: 'Otorgamiento ante notario',
        status: 'PENDING',
        responsibleParty: 'Ambas partes',
        dueDate: daysFromNow(28),
      },
    ],
  });

  // ── Hoja de encargo ───────────────────────────────────────────────────────────
  await createEngagementLetter(prisma, storage, tenant, matter, {
    scope:
      'Asesoramiento en la compraventa del edificio de oficinas de C/ Acanto 22 (Madrid): due diligence inmobiliaria (registral, urbanística, técnica, arrendaticia y fiscal), negociación de arras y escritura, condiciones previas y asistencia al otorgamiento notarial.',
    fees: 'Honorarios de 32.000 € + gastos. Provisión de fondos de 12.000 €. No incluye ITP/AJD ni aranceles notariales/registrales. IVA aparte.',
    terms: 'Facturación 40% a la firma de arras, 60% al otorgamiento. Suplidos previa provisión.',
    generatedById: admin.id,
    at: monthsAgo(2, 13),
  });

  // ── Tareas + plazo procesal ─────────────────────────────────────────────────--
  await addTask(prisma, tenant, matter, {
    title: 'Recabar la carta de pago del banco para cancelar la hipoteca',
    status: 'IN_PROGRESS',
    dueDate: daysFromNow(5),
    assigneeId: a1.id,
  });
  await addTask(prisma, tenant, matter, {
    title: 'Confirmar el estoppel del arrendatario de la planta 3',
    status: 'TODO',
    dueDate: daysFromNow(9),
    assigneeId: a2.id,
  });
  await addTask(prisma, tenant, matter, {
    title: 'Cuadrar la provisión de ITP/AJD con la compradora',
    status: 'TODO',
    dueDate: daysFromNow(12),
    assigneeId: admin.id,
  });
  // Procedimiento de desahucio del local de la planta baja (ocupante sin título): plazo computado.
  await addProceduralDeadline(prisma, tenant, matter, {
    title: 'Oposición al desahucio — ocupante de la planta baja',
    deadlineType: 'Contestación a la demanda',
    days: 10,
    receivedAt: daysFromNow(-3),
    court: 'Juzgado de Primera Instancia nº 7 de Madrid',
    procedureRef: 'Juicio verbal 540/2026',
    actType: 'Decreto de admisión',
    subject:
      'Desahucio por precario del ocupante de la planta baja, condición para entregar el inmueble libre.',
    assigneeId: a2.id,
    createdById: admin.id,
  });

  // ── Partes de horas (con bolsa sin facturar) ──────────────────────────────────
  await addTimeEntries(prisma, tenant, matter, [
    {
      userId: admin.id,
      description: 'Negociación y redacción del contrato de arras',
      minutes: 180,
      hourlyRate: 240,
      billed: true,
      workedAt: monthsAgo(2, 17),
    },
    {
      userId: a1.id,
      description: 'Due diligence registral y de cargas',
      minutes: 240,
      hourlyRate: 170,
      billed: true,
      workedAt: monthsAgo(1, 8),
    },
    {
      userId: a2.id,
      description: 'Revisión urbanística y técnica (ITE)',
      minutes: 200,
      hourlyRate: 160,
      billed: false,
      workedAt: daysFromNow(-7),
    },
    {
      userId: a1.id,
      description: 'Análisis del arrendamiento de la planta 3 y estoppel',
      minutes: 120,
      hourlyRate: 170,
      billed: false,
      workedAt: daysFromNow(-3),
    },
    {
      userId: admin.id,
      description: 'Coordinación con notaría y entidad financiadora',
      minutes: 90,
      hourlyRate: 240,
      billed: false,
      workedAt: daysFromNow(-1),
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
  const f1 = monthsAgo(2, 14);
  await issueInvoice(prisma, {
    tenant,
    client: buyer,
    matter,
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
        description: 'Honorarios — fase de arras (40%)',
        quantity: 1,
        unitPrice: '12800.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  const f2 = monthsAgo(1, 9);
  await issueInvoice(prisma, {
    tenant,
    client: buyer,
    matter,
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
        description: 'Suplido — nota simple y certificaciones',
        quantity: 1,
        unitPrice: '180.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  const f3 = monthsAgo(2, 1);
  const overdue = await issueInvoice(prisma, {
    tenant,
    client: seller,
    matter,
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
        description: 'Honorarios — coordinación cancelación de hipoteca',
        quantity: 1,
        unitPrice: '4500.00',
        taxCode: 'IVA_STANDARD',
      },
    ],
  });
  await addDunningReminder(prisma, tenant, overdue.invoice, 1, 'REMINDER');
  // Cliente DO comprando un apartamento en Sto. Domingo (e-CF / DOP).
  const doMatter = await createMatter(prisma, tenant, {
    reference: 'SL-2026-040',
    title: 'Compraventa de apartamento — Torre Anacaona, Santo Domingo',
    type: 'Inmobiliario · Compraventa (RD)',
    status: 'IN_PROGRESS',
    clientId: doBuyer.id,
    lawyerId: a1.id,
    budgetAmount: '9000.00',
  });
  const f4 = monthsAgo(1, 3);
  await issueInvoice(prisma, {
    tenant,
    client: doBuyer,
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
        description: 'Honorarios — due diligence y escritura (RD)',
        quantity: 1,
        unitPrice: '180000.00',
        taxCode: 'ITBIS_STANDARD',
      },
    ],
  });

  // ── Leads ───────────────────────────────────────────────────────────────────--
  await addLeads(prisma, tenant, [
    {
      name: 'Residencial Aldea Verde',
      company: 'Aldea Verde Promociones',
      email: 'compras@aldeaverde.demo',
      subject: 'Compra de suelo finalista',
      source: 'referido',
      status: 'QUALIFIED',
      estimatedValue: '28000.00',
      assignedToId: admin.id,
      at: daysFromNow(-8),
    },
    {
      name: 'Family Office Llopis',
      company: 'FO Llopis',
      email: 'real.estate@llopis.demo',
      subject: 'Sale & leaseback de oficinas',
      source: 'web',
      status: 'CONTACTED',
      estimatedValue: '35000.00',
      assignedToId: a1.id,
      at: daysFromNow(-4),
    },
    {
      name: 'Marta Sáenz',
      email: 'marta.saenz@correo.demo',
      subject: 'Compra de vivienda con litigio de lindes',
      source: 'intake',
      status: 'NEW',
      estimatedValue: '6000.00',
      at: daysFromNow(-2),
    },
    {
      name: 'Hostelería del Sur',
      company: 'Hostelería del Sur',
      email: 'expansion@hosteleriasur.demo',
      subject: 'Arrendamiento de local con opción de compra',
      source: 'manual',
      status: 'NEW',
      estimatedValue: '9000.00',
      at: daysFromNow(-1),
    },
    {
      name: 'Promociones Bahía',
      company: 'Promociones Bahía',
      email: 'info@pbahia.demo',
      subject: 'Due diligence de cartera de garajes',
      source: 'intake',
      status: 'LOST',
      notes: 'Aplazado a 2027.',
      at: daysFromNow(-25),
    },
  ]);

  return { tenant, counts: { clients: 4, matters: 2, invoices: seq - 1, dataRoomToken: dr.grant } };
}
