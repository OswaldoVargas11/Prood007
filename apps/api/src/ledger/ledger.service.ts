import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, LedgerEntryType } from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { CreateLedgerEntryDto, MANUAL_LEDGER_TYPES } from './dto/create-ledger-entry.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
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

    const result = await this.prisma.$transaction(async (tx) => {
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
    const balance = entries.reduce(
      (sum, e) => sum + BALANCE_SIGN[e.type as LedgerEntryType] * Number(e.amount),
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
    const count = await this.prisma.invoice.count({ where: { tenantId } });
    return `FAC-${year}-${String(count + 1).padStart(4, '0')}`;
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

    const invoice = await this.prisma.$transaction(async (tx) => {
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

    await this.prisma.$transaction([
      this.prisma.ledgerEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: invoice.matterId,
          type: LedgerEntryType.PAYMENT,
          description: `Cobro factura ${invoice.number}`,
          amount: invoice.total,
          currency: invoice.currency,
          invoiceId: invoice.id,
        },
      }),
      this.prisma.invoice.updateMany({
        where: { id, tenantId: user.tenantId },
        data: { status: InvoiceStatus.PAID },
      }),
    ]);
    await this.audit.log(user, 'invoice.paid', 'Invoice', id);
    return this.getInvoice(user, id);
  }
}
