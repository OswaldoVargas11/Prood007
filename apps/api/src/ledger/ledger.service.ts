import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, InvoiceStatus, LedgerEntryType } from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLedgerEntryDto, MANUAL_LEDGER_TYPES } from './dto/create-ledger-entry.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PreviewInvoiceDto } from './dto/preview-invoice.dto';
import { ProposeCostDto } from './dto/propose-cost.dto';
import { ResolveApprovalDto } from './dto/resolve-approval.dto';
import type { RequestUser } from '../auth/auth.types';

/**
 * Ledger jurídico transparente + facturación.
 *
 * Convención de signo para el saldo (lo que el cliente ve en tiempo real):
 *  - PROVISION / PAYMENT  → +  (fondos aportados por el cliente)
 *  - DISBURSEMENT / TIME_FEE / FEE → −  (gastos y honorarios)
 *  - ADJUSTMENT → +  (el importe puede ser negativo para ajustes a la baja)
 *  - INVOICE → 0  (la factura es un documento que resume cargos ya reflejados; no mueve saldo)
 */
const BALANCE_SIGN: Record<LedgerEntryType, number> = {
  [LedgerEntryType.PROVISION]: 1,
  [LedgerEntryType.PAYMENT]: 1,
  [LedgerEntryType.DISBURSEMENT]: -1,
  [LedgerEntryType.TIME_FEE]: -1,
  [LedgerEntryType.FEE]: -1,
  [LedgerEntryType.ADJUSTMENT]: 1,
  [LedgerEntryType.INVOICE]: 0,
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getMatterOrThrow(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      include: { client: true, tenant: true },
    });
    if (!matter) throw new BadRequestException('El expediente no existe en este despacho.');
    return matter;
  }

  // ── Apuntes manuales ────────────────────────────────────────────────────
  async addEntry(user: RequestUser, dto: CreateLedgerEntryDto) {
    if (!MANUAL_LEDGER_TYPES.includes(dto.type as (typeof MANUAL_LEDGER_TYPES)[number])) {
      throw new BadRequestException('Tipo de apunte no permitido manualmente.');
    }
    const amount = Number(dto.amount);
    if (dto.type !== LedgerEntryType.ADJUSTMENT && amount < 0) {
      throw new BadRequestException('El importe debe ser positivo para este tipo de apunte.');
    }
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    const entry = await this.prisma.ledgerEntry.create({
      data: {
        tenantId: user.tenantId,
        matterId: matter.id,
        type: dto.type,
        description: dto.description,
        amount: dto.amount,
        currency: matter.tenant.currency,
      },
    });
    await this.audit.log(user, 'ledger.entry_added', 'LedgerEntry', entry.id, { type: dto.type });
    return entry;
  }

  // ── Horas con tarifa ────────────────────────────────────────────────────
  async addTimeEntry(user: RequestUser, dto: CreateTimeEntryDto) {
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    const feeAmount = round2((dto.minutes / 60) * Number(dto.hourlyRate));

    const result = await tenantTransaction(this.prisma, async (tx) => {
      const time = await tx.timeEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          userId: user.userId,
          description: dto.description,
          minutes: dto.minutes,
          hourlyRate: dto.hourlyRate,
          workedAt: new Date(dto.workedAt),
        },
      });
      const ledger = await tx.ledgerEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          type: LedgerEntryType.TIME_FEE,
          description: `Honorarios (${(dto.minutes / 60).toFixed(2)} h): ${dto.description}`,
          amount: feeAmount.toFixed(2),
          currency: matter.tenant.currency,
        },
      });
      return { time, ledger };
    });
    await this.audit.log(user, 'time.logged', 'TimeEntry', result.time.id, { feeAmount });
    return result;
  }

  // ── Vista del ledger (transparente) ─────────────────────────────────────
  async getMatterLedger(user: RequestUser, matterId: string) {
    const matter = await this.getMatterOrThrow(user, matterId);
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { occurredAt: 'asc' },
    });
    // Solo los apuntes APROBADOS mueven el saldo; los propuestos/rechazados no.
    const balance = entries.reduce(
      (sum, e) =>
        e.approvalStatus === ApprovalStatus.APPROVED
          ? sum + BALANCE_SIGN[e.type as LedgerEntryType] * Number(e.amount)
          : sum,
      0,
    );
    return {
      matterId,
      currency: matter.tenant.currency,
      balance: round2(balance).toFixed(2),
      entries,
    };
  }

  // ── Facturación ─────────────────────────────────────────────────────────
  private async nextInvoiceNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const [count, tenant] = await Promise.all([
      this.prisma.invoice.count({ where: { tenantId } }),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { invoiceSeries: true },
      }),
    ]);
    const series = tenant.invoiceSeries || 'FAC';
    return `${series}-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  /**
   * Pre-cálculo fiscal READ-ONLY (sin crear factura ni mover estado). Resuelve el provider de la
   * jurisdicción del tenant y delega en `previewInvoice`, que comparte la MISMA matemática fiscal
   * que la emisión real (`buildInvoiceRecord`): preview y factura emitida nunca divergen.
   */
  previewInvoice(user: RequestUser, dto: PreviewInvoiceDto) {
    const provider = this.compliance.forTenant({ jurisdiction: user.jurisdiction });
    // La descripción no interviene en la matemática fiscal; se completa neutra para el tipo de línea.
    const lines = dto.lines.map((l) => ({
      description: '',
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode,
    }));
    try {
      return provider.previewInvoice(lines, dto.withholdingTaxCode);
    } catch {
      throw new BadRequestException(
        'No se pudo calcular el preview fiscal con los datos indicados.',
      );
    }
  }

  async createInvoice(user: RequestUser, dto: CreateInvoiceDto) {
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    if (!matter.tenant.taxId) {
      throw new BadRequestException(
        'El despacho no tiene identificador fiscal configurado; no se puede facturar.',
      );
    }

    const provider = this.compliance.forTenant({ jurisdiction: user.jurisdiction });
    const number = await this.nextInvoiceNumber(user.tenantId);
    const issueDate = dto.issueDate ?? new Date().toISOString().slice(0, 10);

    // Encadenamiento: huella del último registro fiscal emitido por el tenant.
    const previous = await this.prisma.invoice.findFirst({
      where: { tenantId: user.tenantId, recordHash: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { recordHash: true },
    });

    const record = await provider.buildInvoiceRecord({
      invoiceNumber: number,
      issueDate,
      currency: matter.tenant.currency,
      seller: { name: matter.tenant.name, taxId: matter.tenant.taxId },
      buyer: { name: matter.client.name, taxId: matter.client.taxId },
      lines: dto.lines,
      withholdingTaxCode: dto.withholdingTaxCode,
      previousRecordHash: previous?.recordHash ?? undefined,
    });

    const invoice = await tenantTransaction(this.prisma, async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          clientId: matter.clientId,
          number,
          status: InvoiceStatus.ISSUED,
          issueDate: new Date(issueDate),
          currency: matter.tenant.currency,
          taxableBase: record.totals.taxableBase,
          taxAmount: record.totals.taxAmount,
          withholdingAmount: record.totals.withholdingAmount,
          total: record.totals.total,
          complianceFormat: record.format,
          complianceRecord: record.payload as object,
          recordHash: record.recordHash,
          previousRecordHash: previous?.recordHash ?? null,
          lines: {
            create: dto.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxCode: l.taxCode,
              lineTotal: round2(Number(l.quantity) * Number(l.unitPrice)).toFixed(2),
            })),
          },
        },
        include: { lines: true },
      });
      // Apunte de ledger informativo ligado a la factura (no mueve saldo).
      await tx.ledgerEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          type: LedgerEntryType.INVOICE,
          description: `Factura ${number}`,
          amount: record.totals.total,
          currency: matter.tenant.currency,
          invoiceId: created.id,
        },
      });
      return created;
    });

    await this.audit.log(user, 'invoice.issued', 'Invoice', invoice.id, {
      number,
      total: record.totals.total,
      format: record.format,
    });
    return { invoice, compliance: record };
  }

  async getInvoice(user: RequestUser, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { lines: true, client: { select: { id: true, name: true, taxId: true } } },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');
    return invoice;
  }

  async payInvoice(user: RequestUser, id: string) {
    const invoice = await this.getInvoice(user, id);
    if (invoice.status === InvoiceStatus.PAID) return invoice;

    await tenantTransaction(this.prisma, async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: invoice.matterId,
          type: LedgerEntryType.PAYMENT,
          description: `Cobro factura ${invoice.number}`,
          amount: invoice.total,
          currency: invoice.currency,
          invoiceId: invoice.id,
        },
      });
      await tx.invoice.updateMany({
        where: { id, tenantId: user.tenantId },
        data: { status: InvoiceStatus.PAID },
      });
    });
    await this.audit.log(user, 'invoice.paid', 'Invoice', id);
    return this.getInvoice(user, id);
  }

  // ── Aprobación de costes ─────────────────────────────────────────────────
  /** Un letrado (o admin) propone un coste (suplido). Nace PROPOSED: no afecta al saldo hasta aprobarse. */
  async proposeCost(user: RequestUser, dto: ProposeCostDto) {
    const amount = Number(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('El importe debe ser positivo.');
    const matter = await this.getMatterOrThrow(user, dto.matterId);

    const entry = await this.prisma.ledgerEntry.create({
      data: {
        tenantId: user.tenantId,
        matterId: matter.id,
        type: LedgerEntryType.DISBURSEMENT,
        description: dto.description,
        amount: dto.amount,
        currency: matter.tenant.currency,
        approvalStatus: ApprovalStatus.PROPOSED,
        proposedById: user.userId,
        approvalNote: dto.note,
      },
    });
    await this.audit.log(user, 'cost.proposed', 'LedgerEntry', entry.id, {
      matterId: matter.id,
      amount: dto.amount,
    });
    // Avisa a los administradores del despacho de que hay un coste pendiente de aprobar.
    await this.notifyAdmins(user.tenantId, {
      type: 'cost.proposed',
      title: `Coste pendiente de aprobar: ${matter.reference}`,
      body: `${dto.description} · ${dto.amount}`,
      data: { ledgerEntryId: entry.id, matterId: matter.id },
    });
    return entry;
  }

  /** Lista los costes propuestos pendientes (PROPOSED) del despacho, con expediente y proponente. */
  async listApprovals(user: RequestUser) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId: user.tenantId, approvalStatus: ApprovalStatus.PROPOSED },
      orderBy: { createdAt: 'desc' },
      include: {
        matter: { select: { id: true, reference: true, title: true } },
      },
    });
    const proposerIds = [
      ...new Set(entries.map((e) => e.proposedById).filter((x): x is string => Boolean(x))),
    ];
    const proposers = proposerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: proposerIds }, tenantId: user.tenantId },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(proposers.map((p) => [p.id, p.fullName]));
    return entries.map((e) => ({
      id: e.id,
      matter: e.matter,
      description: e.description,
      amount: e.amount.toString(),
      currency: e.currency,
      note: e.approvalNote,
      proposedBy: e.proposedById ? (nameById.get(e.proposedById) ?? '—') : '—',
      createdAt: e.createdAt,
    }));
  }

  private async resolveApproval(
    user: RequestUser,
    id: string,
    status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED,
    note?: string,
  ) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!entry) throw new NotFoundException('Apunte no encontrado.');
    if (entry.approvalStatus !== ApprovalStatus.PROPOSED) {
      throw new BadRequestException('Este coste ya fue resuelto.');
    }
    await this.prisma.ledgerEntry.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        approvalStatus: status,
        resolvedById: user.userId,
        approvalNote: note ?? entry.approvalNote,
      },
    });
    const action = status === ApprovalStatus.APPROVED ? 'cost.approved' : 'cost.rejected';
    await this.audit.log(user, action, 'LedgerEntry', id, { matterId: entry.matterId });
    // Notifica al proponente la resolución.
    if (entry.proposedById && entry.proposedById !== user.userId) {
      await this.notifications.create({
        tenantId: user.tenantId,
        userId: entry.proposedById,
        type: action,
        title: status === ApprovalStatus.APPROVED ? 'Coste aprobado' : 'Coste rechazado',
        body: entry.description,
        data: { ledgerEntryId: id, matterId: entry.matterId },
      });
    }
    return { id, approvalStatus: status };
  }

  approveCost(user: RequestUser, id: string, dto: ResolveApprovalDto) {
    return this.resolveApproval(user, id, ApprovalStatus.APPROVED, dto.note);
  }

  rejectCost(user: RequestUser, id: string, dto: ResolveApprovalDto) {
    return this.resolveApproval(user, id, ApprovalStatus.REJECTED, dto.note);
  }

  /** Notifica a todos los administradores ACTIVOS del despacho. */
  private async notifyAdmins(
    tenantId: string,
    params: { type: string; title: string; body?: string; data?: Record<string, unknown> },
  ) {
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        roles: { some: { role: { code: 'FIRM_ADMIN' } } },
      },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        this.notifications.create({
          tenantId,
          userId: a.id,
          type: params.type,
          title: params.title,
          body: params.body,
          data: params.data,
        }),
      ),
    );
  }
}
