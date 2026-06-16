import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BillingFiscalMode,
  BillingInterval,
  BillingInstallmentStatus,
  BillingScheduleStatus,
  BillingScheduleType,
} from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { CreateBillingScheduleDto } from './dto/create-billing-schedule.dto';
import type { RequestUser } from '../auth/auth.types';

/** Una línea de la plantilla del plan (igual forma que la línea de factura). */
interface ScheduleLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
}

/**
 * Facturación programada (D-028): crea planes (RECURRING | INSTALLMENTS) y genera su cuadro de cuotas.
 * NO emite facturas ni cobra (eso es RP3/RP4); aquí solo se planifica. La emisión, cuando llegue, pasará
 * por `LedgerService.emitInvoiceInTx` (serie + Verifactu/e-CF + QR; sin atajos).
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getMatterOrThrow(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      include: {
        tenant: { select: { currency: true } },
        client: { select: { id: true } },
      },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
    return matter;
  }

  /** Suma `count` × `unit` a una fecha (UTC). MONTHLY/QUARTERLY/YEARLY usan meses naturales. */
  private addInterval(base: Date, unit: BillingInterval, count: number): Date {
    const d = new Date(base);
    if (unit === BillingInterval.WEEKLY) {
      d.setUTCDate(d.getUTCDate() + 7 * count);
      return d;
    }
    const months =
      unit === BillingInterval.MONTHLY
        ? count
        : unit === BillingInterval.QUARTERLY
          ? 3 * count
          : 12 * count;
    d.setUTCMonth(d.getUTCMonth() + months);
    return d;
  }

  /** Base imponible de la plantilla = Σ(cantidad × precio). */
  private templateBase(lines: ScheduleLine[]): number {
    return round2(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0));
  }

  /**
   * Crea un plan + su cuadro de cuotas (atómico). RECURRING: una cuota por periodo (las `occurrences`
   * indicadas; si es abierto, solo la primera — el cron añade las siguientes). INSTALLMENTS: `installmentCount`
   * cuotas, repartiendo la base de la plantilla a partes iguales (la última absorbe el redondeo).
   */
  async createSchedule(user: RequestUser, dto: CreateBillingScheduleDto) {
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    const currency = matter.tenant.currency;
    const lines = dto.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode,
    }));
    const base = this.templateBase(lines);
    if (!(base > 0)) throw new BadRequestException(apiError('billing.amountPositive'));

    const intervalCount = dto.intervalCount ?? 1;
    const startDate = new Date(dto.startDate);

    // Reglas por tipo + cuadro de cuotas a generar.
    let installments: { sequence: number; dueDate: Date; amount: number }[] = [];
    let fiscalMode: BillingFiscalMode = BillingFiscalMode.SERVICE_RENDERED;

    if (dto.type === BillingScheduleType.RECURRING) {
      if (dto.installmentCount != null) {
        throw new BadRequestException(apiError('billing.recurringNoInstallmentCount'));
      }
      // Periodos a generar de antemano: los acotados (`occurrences`); el abierto genera solo el primero.
      const count = dto.occurrences ?? 1;
      installments = Array.from({ length: count }, (_, k) => ({
        sequence: k + 1,
        dueDate: this.addInterval(startDate, dto.intervalUnit, intervalCount * k),
        amount: base,
      }));
    } else {
      // INSTALLMENTS: fraccionar.
      const n = dto.installmentCount;
      if (n == null || n < 2) {
        throw new BadRequestException(apiError('billing.installmentCountRequired'));
      }
      fiscalMode = dto.fiscalMode ?? BillingFiscalMode.SERVICE_RENDERED;
      const per = round2(base / n);
      installments = Array.from({ length: n }, (_, k) => ({
        sequence: k + 1,
        // La última cuota absorbe el redondeo para que Σ cuotas == base.
        amount: k === n - 1 ? round2(base - per * (n - 1)) : per,
        dueDate: this.addInterval(startDate, dto.intervalUnit, intervalCount * k),
      }));
    }

    const out = await tenantTransaction(this.prisma, async (tx) => {
      const schedule = await tx.billingSchedule.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          clientId: matter.client.id,
          currency,
          type: dto.type,
          fiscalMode,
          status: BillingScheduleStatus.ACTIVE,
          lines: lines as unknown as Prisma.InputJsonValue,
          withholdingTaxCode: dto.withholdingTaxCode ?? null,
          intervalUnit: dto.intervalUnit,
          intervalCount,
          occurrences:
            dto.type === BillingScheduleType.RECURRING ? (dto.occurrences ?? null) : null,
          installmentCount:
            dto.type === BillingScheduleType.INSTALLMENTS ? (dto.installmentCount ?? null) : null,
          startDate,
          nextRunAt: installments[0]?.dueDate ?? startDate,
          note: dto.note ?? null,
        },
      });
      await tx.billingInstallment.createMany({
        data: installments.map((i) => ({
          tenantId: user.tenantId,
          scheduleId: schedule.id,
          sequence: i.sequence,
          dueDate: i.dueDate,
          amount: i.amount.toFixed(2),
          status: BillingInstallmentStatus.SCHEDULED,
        })),
      });
      return schedule;
    });

    await this.audit.log(user, 'billing.schedule_created', 'BillingSchedule', out.id, {
      matterId: matter.id,
      type: dto.type,
      installments: installments.length,
    });
    return this.getSchedule(user, out.id);
  }

  /** Planes de facturación de un expediente (con su nº de cuotas), acotado al tenant. */
  async listMatterSchedules(user: RequestUser, matterId: string) {
    await this.getMatterOrThrow(user, matterId);
    const schedules = await this.prisma.billingSchedule.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { installments: true } } },
    });
    return schedules.map((s) => ({
      id: s.id,
      type: s.type,
      fiscalMode: s.fiscalMode,
      status: s.status,
      currency: s.currency,
      intervalUnit: s.intervalUnit,
      intervalCount: s.intervalCount,
      occurrences: s.occurrences,
      installmentCount: s.installmentCount,
      startDate: s.startDate,
      nextRunAt: s.nextRunAt,
      installments: s._count.installments,
      createdAt: s.createdAt,
    }));
  }

  /** Un plan con su cuadro de cuotas (acotado al tenant). */
  async getSchedule(user: RequestUser, id: string) {
    const schedule = await this.prisma.billingSchedule.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    });
    if (!schedule) throw new NotFoundException(apiError('billing.scheduleNotFound'));
    return {
      id: schedule.id,
      matterId: schedule.matterId,
      clientId: schedule.clientId,
      currency: schedule.currency,
      type: schedule.type,
      fiscalMode: schedule.fiscalMode,
      status: schedule.status,
      lines: schedule.lines,
      withholdingTaxCode: schedule.withholdingTaxCode,
      intervalUnit: schedule.intervalUnit,
      intervalCount: schedule.intervalCount,
      occurrences: schedule.occurrences,
      installmentCount: schedule.installmentCount,
      startDate: schedule.startDate,
      nextRunAt: schedule.nextRunAt,
      note: schedule.note,
      createdAt: schedule.createdAt,
      installments: schedule.installments.map((i) => ({
        id: i.id,
        sequence: i.sequence,
        dueDate: i.dueDate,
        amount: i.amount.toFixed(2),
        status: i.status,
        invoiceId: i.invoiceId,
        paymentId: i.paymentId,
      })),
    };
  }
}
