/**
 * Constructores de alto nivel sobre Prisma (rol privilegiado) para poblar un expediente DEMO:
 * clientes, expedientes con timeline, documentos versionados + redline, data room (enlace mágico,
 * permisos por carpeta, marca de agua, Q&A, log), checklist de cierre, hoja de encargo, tareas
 * (incl. plazo procesal), partes de horas, leads, dunning. Todo ficticio y `tenantId` explícito.
 *
 * Claves de almacenamiento ESPEJO de la API (para que descarga/redline/marca de agua funcionen):
 *   · versión de documento:  `${tenantId}/documents/${documentId}/v${version}`
 *   · documento de data room: `${tenantId}/datarooms/${roomId}/${docId}`
 */
import { createHash, randomBytes } from 'node:crypto';
import { SpainComplianceProvider, DominicanComplianceProvider } from '@legalflow/compliance';
import { pdfDoc, textBlob } from './artifacts.mjs';

const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const deadlineProvider = (jur) =>
  jur === 'do' ? new DominicanComplianceProvider() : new SpainComplianceProvider();

// ── Clientes ──────────────────────────────────────────────────────────────────
export async function createClient(prisma, tenant, data) {
  return prisma.client.create({
    data: {
      tenantId: tenant.id,
      name: data.name,
      taxId: data.taxId,
      taxIdKind: data.taxIdKind ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      kyc: data.kyc
        ? {
            create: {
              tenantId: tenant.id,
              status: data.kyc.status ?? 'APPROVED',
              risk: data.kyc.risk ?? 'LOW',
              isPep: data.kyc.isPep ?? false,
              identityVerified: data.kyc.identityVerified ?? true,
              sanctionsChecked: data.kyc.sanctionsChecked ?? true,
            },
          }
        : undefined,
    },
  });
}

// ── Expedientes ─────────────────────────────────────────────────────────────--
export async function createMatter(prisma, tenant, data) {
  const matter = await prisma.matter.create({
    data: {
      tenantId: tenant.id,
      reference: data.reference,
      title: data.title,
      type: data.type,
      status: data.status ?? 'IN_PROGRESS',
      clientId: data.clientId,
      lawyerId: data.lawyerId ?? null,
      budgetAmount: data.budgetAmount ?? null,
      opposingParty: data.opposingParty ?? null,
      opposingPartyTaxId: data.opposingPartyTaxId ?? null,
      opposingCounsel: data.opposingCounsel ?? null,
      court: data.court ?? null,
      caseNumber: data.caseNumber ?? null,
      proceduralPhase: data.proceduralPhase ?? null,
      openedAt: data.openedAt ?? undefined,
    },
  });
  // Provisión de fondos (retainer) si se pide → tesorería del expediente no sale vacía.
  if (data.retainer) {
    const account = await prisma.retainerAccount.create({
      data: {
        tenantId: tenant.id,
        matterId: matter.id,
        currency: tenant.currency,
        balance: String(data.retainer),
      },
    });
    await prisma.retainerEntry.create({
      data: {
        tenantId: tenant.id,
        accountId: account.id,
        type: 'DEPOSIT',
        kind: 'GENERICO',
        amount: String(data.retainer),
        note: 'Provisión de fondos inicial (demo)',
      },
    });
  }
  return matter;
}

/** Timeline de actividad: filas de AuditLog (lo que alimenta la cronología del expediente). */
export async function addActivity(prisma, tenant, matter, actorId, events) {
  for (const ev of events) {
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: actorId ?? null,
        action: ev.action,
        entityType: ev.entityType ?? 'Matter',
        entityId: ev.entityId ?? matter.id,
        metadata: ev.metadata ?? { matter: matter.reference },
        createdAt: ev.at,
      },
    });
  }
}

/** Mensajes internos del hilo del expediente. */
export async function addMessages(prisma, tenant, matter, messages) {
  for (const m of messages) {
    await prisma.message.create({
      data: {
        tenantId: tenant.id,
        matterId: matter.id,
        authorId: m.authorId,
        body: m.body,
        createdAt: m.at,
      },
    });
  }
}

// ── Documentos + versiones (+ redline) ─────────────────────────────────────────
/**
 * Crea un documento con N versiones. Cada versión: { kind:'pdf'|'text', title, paragraphs, text,
 * reviewStatus, at }. Sube el contenido al almacenamiento (best-effort) con la clave que espera la API.
 * @returns {Promise<{ document, versions: Array<{ id, version, storageKey }> }>}
 */
export async function createDocument(prisma, storage, tenant, matter, spec) {
  const document = await prisma.document.create({
    data: { tenantId: tenant.id, matterId: matter.id, name: spec.name },
  });
  const versions = [];
  for (let i = 0; i < spec.versions.length; i++) {
    const v = spec.versions[i];
    const version = i + 1;
    const artifact =
      v.kind === 'text'
        ? textBlob(v.text)
        : await pdfDoc(v.title ?? spec.name, v.paragraphs ?? ['Documento de demostración.']);
    const storageKey = `${tenant.id}/documents/${document.id}/v${version}`;
    await storage.put(storageKey, artifact.bytes, artifact.mimeType);
    const row = await prisma.documentVersion.create({
      data: {
        tenantId: tenant.id,
        documentId: document.id,
        version,
        storageKey,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        contentHash: sha256hex(artifact.bytes),
        reviewStatus: v.reviewStatus ?? 'PENDING',
        uploadedById: v.uploadedById,
        createdAt: v.at ?? undefined,
      },
    });
    // Revisión registrada si la versión está aprobada/rechazada (para que la pestaña de revisión viva).
    if (v.reviewStatus && v.reviewStatus !== 'PENDING' && v.reviewerId) {
      await prisma.documentReview.create({
        data: {
          tenantId: tenant.id,
          versionId: row.id,
          reviewerId: v.reviewerId,
          status: v.reviewStatus,
          comment: v.reviewComment ?? null,
          createdAt: v.at ?? undefined,
        },
      });
    }
    versions.push({ id: row.id, version, storageKey });
  }
  return { document, versions };
}

// ── Data room ───────────────────────────────────────────────────────────────--
/**
 * Crea un data room con árbol de carpetas, documentos (PDF subidos), un enlace mágico ACTIVO con
 * permisos por carpeta + marca de agua, log de accesos y Q&A. Devuelve el TOKEN en claro (solo se
 * muestra una vez; en BD queda su sha256).
 *
 * @returns {Promise<{ room, folders: Record<string,object>, grant: { token, url } }>}
 */
export async function createDataRoom(prisma, storage, tenant, matter, spec) {
  const room = await prisma.dataRoom.create({
    data: {
      tenantId: tenant.id,
      matterId: matter.id,
      name: spec.name,
      watermark: true,
      status: 'OPEN',
    },
  });

  // Carpetas (primer nivel). `spec.folders` = [{ key, name }]
  const folders = {};
  let order = 0;
  for (const f of spec.folders) {
    folders[f.key] = await prisma.dataRoomFolder.create({
      data: { tenantId: tenant.id, dataRoomId: room.id, name: f.name, sortOrder: order++ },
    });
  }

  // Documentos: { folderKey, name, title, paragraphs, uploadedById }
  const docs = [];
  for (const d of spec.documents) {
    const created = await prisma.dataRoomDocument.create({
      data: {
        tenantId: tenant.id,
        dataRoomId: room.id,
        folderId: folders[d.folderKey]?.id ?? null,
        name: d.name,
        storageKey: '', // se rellena con el id ya conocido (clave espejo de la API)
        mimeType: 'application/pdf',
        sizeBytes: 0,
        contentHash: '',
        uploadedById: d.uploadedById,
      },
    });
    const artifact = await pdfDoc(
      d.title ?? d.name,
      d.paragraphs ?? ['Documento de data room (demo).'],
    );
    const storageKey = `${tenant.id}/datarooms/${room.id}/${created.id}`;
    await storage.put(storageKey, artifact.bytes, artifact.mimeType);
    const updated = await prisma.dataRoomDocument.update({
      where: { id: created.id },
      data: { storageKey, sizeBytes: artifact.sizeBytes, contentHash: sha256hex(artifact.bytes) },
    });
    docs.push(updated);
  }

  // Enlace mágico (grant) ACTIVO con permisos por carpeta + descarga. Token en claro → solo aquí.
  const token = randomBytes(32).toString('base64url');
  const grant = await prisma.dataRoomGrant.create({
    data: {
      tenantId: tenant.id,
      dataRoomId: room.id,
      email: spec.grant.email,
      name: spec.grant.name ?? null,
      tokenHash: sha256(token),
      role: 'VIEWER',
      canDownload: spec.grant.canDownload ?? true,
      folderIds: (spec.grant.folderKeys ?? []).map((k) => folders[k].id),
      expiresAt: spec.grant.expiresAt ?? null,
      lastAccessAt: spec.grant.lastAccessAt ?? null,
      createdById: spec.grant.createdById,
    },
  });

  // Log de accesos de la contraparte (para que el registro de actividad del data room viva).
  for (const log of spec.accessLogs ?? []) {
    await prisma.dataRoomAccessLog.create({
      data: {
        tenantId: tenant.id,
        dataRoomId: room.id,
        grantId: grant.id,
        actorEmail: log.actorEmail ?? spec.grant.email,
        action: log.action,
        targetId: log.targetId ?? null,
        ip: log.ip ?? '203.0.113.45',
        createdAt: log.at ?? undefined,
      },
    });
  }

  // Q&A: preguntas de la contraparte, algunas respondidas.
  for (const q of spec.questions ?? []) {
    await prisma.dataRoomQuestion.create({
      data: {
        tenantId: tenant.id,
        dataRoomId: room.id,
        grantId: grant.id,
        folderId: q.folderKey ? folders[q.folderKey].id : null,
        askedByEmail: q.askedByEmail ?? spec.grant.email,
        body: q.body,
        answer: q.answer ?? null,
        answeredById: q.answer ? q.answeredById : null,
        answeredAt: q.answer ? (q.answeredAt ?? undefined) : null,
        status: q.answer ? 'ANSWERED' : 'OPEN',
        createdAt: q.at ?? undefined,
      },
    });
  }

  const apiBase = (process.env.SEED_API ?? 'http://localhost:4000/api').replace(/\/$/, '');
  return {
    room,
    folders,
    docs,
    grant: { token, url: `${apiBase}/data-rooms/external/${token}` },
  };
}

// ── Checklist de cierre ─────────────────────────────────────────────────────--
export async function createClosingChecklist(prisma, tenant, matter, spec) {
  const checklist = await prisma.closingChecklist.create({
    data: {
      tenantId: tenant.id,
      matterId: matter.id,
      title: spec.title,
      closingDate: spec.closingDate ?? null,
    },
  });
  let order = 0;
  for (const it of spec.items) {
    await prisma.closingChecklistItem.create({
      data: {
        tenantId: tenant.id,
        checklistId: checklist.id,
        category: it.category,
        title: it.title,
        detail: it.detail ?? null,
        status: it.status ?? 'PENDING',
        responsibleParty: it.responsibleParty ?? null,
        assigneeId: it.assigneeId ?? null,
        documentId: it.documentId ?? null,
        dueDate: it.dueDate ?? null,
        sortOrder: order++,
      },
    });
  }
  return checklist;
}

// ── Hoja de encargo (generada) ─────────────────────────────────────────────────
/** Crea la hoja de encargo y GENERA su PDF como documento del expediente (status GENERATED). */
export async function createEngagementLetter(prisma, storage, tenant, matter, spec) {
  const { document, versions } = await createDocument(prisma, storage, tenant, matter, {
    name: 'Hoja de encargo',
    versions: [
      {
        kind: 'pdf',
        title: 'Hoja de encargo profesional',
        paragraphs: [
          `Despacho: ${tenant.name}.`,
          `ALCANCE DEL ENCARGO: ${spec.scope}`,
          `HONORARIOS: ${spec.fees}`,
          `TÉRMINOS: ${spec.terms}`,
          'Documento generado automáticamente con datos de demostración (ficticios).',
        ],
        reviewStatus: 'APPROVED',
        uploadedById: spec.generatedById,
        reviewerId: spec.generatedById,
        at: spec.at,
      },
    ],
  });
  await prisma.engagementLetter.create({
    data: {
      tenantId: tenant.id,
      matterId: matter.id,
      scope: spec.scope,
      fees: spec.fees,
      terms: spec.terms,
      documentId: document.id,
      status: 'GENERATED',
    },
  });
  return { document, versions };
}

// ── Tareas (normales + plazo procesal computado) ───────────────────────────────
export async function addTask(prisma, tenant, matter, t) {
  return prisma.task.create({
    data: {
      tenantId: tenant.id,
      matterId: matter.id,
      title: t.title,
      description: t.description ?? null,
      status: t.status ?? 'TODO',
      dueDate: t.dueDate ?? null,
      assigneeId: t.assigneeId ?? null,
    },
  });
}

/**
 * Crea un plazo PROCESAL computado con el ComplianceProvider (días hábiles de la jurisdicción) a
 * partir de una notificación judicial (LexNET-lite), y lo encadena a la Task.
 */
export async function addProceduralDeadline(prisma, tenant, matter, spec) {
  const provider = deadlineProvider(tenant.jurisdiction);
  const res = provider.getProceduralDeadlines({
    deadlineType: spec.deadlineType,
    startDate: spec.receivedAt.toISOString().slice(0, 10),
    days: spec.days,
  });
  const dueDate = new Date(res.dueDate);
  const task = await prisma.task.create({
    data: {
      tenantId: tenant.id,
      matterId: matter.id,
      title: spec.title,
      description: spec.description ?? null,
      status: 'TODO',
      dueDate,
      deadlineType: spec.deadlineType,
      isProcedural: true,
      notificationRef: spec.procedureRef ?? null,
      notifiedAt: spec.receivedAt,
      assigneeId: spec.assigneeId ?? null,
    },
  });
  await prisma.judicialNotification.create({
    data: {
      tenantId: tenant.id,
      matterId: matter.id,
      source: 'MANUAL',
      court: spec.court ?? null,
      procedureRef: spec.procedureRef ?? null,
      type: spec.actType ?? null,
      subject: spec.subject,
      receivedAt: spec.receivedAt,
      taskId: task.id,
      createdById: spec.createdById,
    },
  });
  return { task, dueDate };
}

// ── Partes de horas (facturables; con bolsa SIN facturar → salta la alerta) ─────
export async function addTimeEntries(prisma, tenant, matter, entries) {
  for (const e of entries) {
    await prisma.timeEntry.create({
      data: {
        tenantId: tenant.id,
        matterId: matter.id,
        userId: e.userId,
        description: e.description,
        minutes: e.minutes,
        hourlyRate: String(e.hourlyRate),
        billed: e.billed ?? false,
        workedAt: e.workedAt,
      },
    });
  }
}

// ── Leads (embudo CRM en distintas fases) ───────────────────────────────────────
export async function addLeads(prisma, tenant, leads) {
  for (const l of leads) {
    await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        name: l.name,
        email: l.email ?? null,
        phone: l.phone ?? null,
        company: l.company ?? null,
        subject: l.subject ?? null,
        notes: l.notes ?? null,
        source: l.source ?? 'manual',
        status: l.status ?? 'NEW',
        estimatedValue: l.estimatedValue ? String(l.estimatedValue) : null,
        assignedToId: l.assignedToId ?? null,
        createdAt: l.at ?? undefined,
      },
    });
  }
}

/** Recordatorio de cobro (dunning) para una factura vencida → la pantalla de cobros muestra el aviso. */
export async function addDunningReminder(prisma, tenant, invoice, offsetDays, severity) {
  const scheduledFor = new Date(invoice.dueDate);
  scheduledFor.setDate(scheduledFor.getDate() + offsetDays);
  await prisma.dunningReminder.create({
    data: {
      tenantId: tenant.id,
      invoiceId: invoice.id,
      offsetDays,
      severity,
      channel: 'IN_APP',
      status: 'SENT',
      scheduledFor,
      sentAt: scheduledFor,
    },
  });
}
