/**
 * Secretaría de sociedades (escenario 3): libro de actas, libro de socios y movimientos de
 * participaciones + obligaciones recurrentes al Registro. Por sociedad (= Client). Plano CRUD.
 */

/** Libro de actas: crea las actas (junta general / consejo) de una sociedad. */
export async function addCorporateMinutes(prisma, tenant, clientId, minutes) {
  for (const m of minutes) {
    await prisma.corporateMinute.create({
      data: {
        tenantId: tenant.id,
        clientId,
        kind: m.kind ?? 'GENERAL_MEETING',
        title: m.title,
        meetingDate: m.meetingDate,
        body: m.body,
        createdAt: m.meetingDate,
      },
    });
  }
}

/** Libro de socios: alta de socios con sus participaciones. */
export async function addShareholders(prisma, tenant, clientId, holders) {
  for (const h of holders) {
    await prisma.shareholder.create({
      data: {
        tenantId: tenant.id,
        clientId,
        name: h.name,
        taxId: h.taxId ?? null,
        units: h.units,
      },
    });
  }
}

/** Movimientos del libro de socios: transmisiones y ampliaciones (fromName null = emisión/ampliación). */
export async function addShareTransfers(prisma, tenant, clientId, transfers) {
  for (const t of transfers) {
    await prisma.shareTransfer.create({
      data: {
        tenantId: tenant.id,
        clientId,
        fromName: t.fromName ?? null,
        toName: t.toName,
        units: t.units,
        date: t.date,
        note: t.note ?? null,
        createdAt: t.date,
      },
    });
  }
}

/** Obligaciones recurrentes al Registro (depósito de cuentas, legalización de libros, etc.). */
export async function addRegistryObligations(prisma, tenant, clientId, obligations) {
  for (const o of obligations) {
    await prisma.registryObligation.create({
      data: {
        tenantId: tenant.id,
        clientId,
        title: o.title,
        dueDate: o.dueDate,
        recurrence: o.recurrence ?? 'ANNUAL',
        status: o.status ?? 'PENDING',
        filedAt: o.status === 'FILED' ? (o.filedAt ?? o.dueDate) : null,
      },
    });
  }
}
