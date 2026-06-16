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
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_PAYMENT_TERM_DAYS, addDaysUtc } from '../ledger/overdue.util';
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
 * Facturación programada (D-028): crea planes (RECURRING | INSTALLMENTS), genera su cuadro de cuotas y
 * EMITE las facturas de los periodos vencidos. Cada emisión pasa por `LedgerService.emitInvoiceInTx`
 * (serie + registro Verifactu/e-CF + QR + encadenamiento; sin atajos), una factura por periodo (RP3,
 * RECURRING). Las cuotas de un plan de pago (INSTALLMENTS) las emite RP4.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
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

  /** Carga el expediente con los datos fiscales necesarios para emitir (despacho + cliente con NIF). */
  private async getMatterForEmission(tenantId: string, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId },
      include: {
        tenant: { select: { name: true, taxId: true, currency: true } },
        client: { select: { id: true, name: true, taxId: true } },
      },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
    return matter;
  }

  /**
   * Emite las facturas de los periodos VENCIDOS de un plan RECURRING (D-028): por cada cuota SCHEDULED con
   * `dueDate <= ahora`, emite **1 factura del periodo** vía `LedgerService.emitInvoiceInTx` (serie +
   * registro Verifactu/e-CF + QR + encadenamiento) y marca la cuota EMITTED. Atómico **por periodo** (un
   * fallo en el periodo k no deshace los k-1 ya emitidos, y no deja hueco en la serie). En planes ABIERTOS
   * genera la siguiente cuota tras emitir. Avanza `nextRunAt`; si el plan acotado se agota → COMPLETED.
   * El cron de barrido (RP5) llamará a este mismo motor para todos los planes vencidos.
   */
  async runDueEmissions(user: RequestUser, scheduleId: string) {
    const schedule = await this.prisma.billingSchedule.findFirst({
      where: { id: scheduleId, tenantId: user.tenantId },
    });
    if (!schedule) throw new NotFoundException(apiError('billing.scheduleNotFound'));
    if (schedule.type !== BillingScheduleType.RECURRING) {
      // La emisión de planes de pago (INSTALLMENTS) llega en RP4.
      throw new BadRequestException(apiError('billing.installmentsRunNotYet'));
    }
    if (schedule.status !== BillingScheduleStatus.ACTIVE) {
      throw new BadRequestException(apiError('billing.scheduleNotActive'));
    }

    const matter = await this.getMatterForEmission(user.tenantId, schedule.matterId);
    if (!matter.tenant.taxId) throw new BadRequestException(apiError('ledger.firmNoTaxId'));
    if (!matter.client.taxId) throw new BadRequestException(apiError('clients.taxIdInvalid'));

    const lines = (schedule.lines as unknown as ScheduleLine[]).map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode,
    }));
    const withholdingTaxCode = schedule.withholdingTaxCode ?? undefined;
    const matterArg = {
      id: matter.id,
      clientId: matter.client.id,
      tenant: {
        name: matter.tenant.name,
        taxId: matter.tenant.taxId,
        currency: matter.tenant.currency,
      },
      client: { name: matter.client.name, taxId: matter.client.taxId as string },
    };

    const now = new Date();
    const emitted: { invoiceId: string; number: string; sequence: number }[] = [];

    // Bucle: emite cada periodo vencido en su propia transacción (atómico por factura).
    // Cota de seguridad: el nº de cuotas vivas del plan (evita un bucle infinito por datos corruptos).
    for (let guard = 0; guard < 1000; guard++) {
      const next = await this.prisma.billingInstallment.findFirst({
        where: {
          tenantId: user.tenantId,
          scheduleId: schedule.id,
          status: BillingInstallmentStatus.SCHEDULED,
          dueDate: { lte: now },
        },
        orderBy: { sequence: 'asc' },
      });
      if (!next) break;

      // La factura se EXPIDE hoy (no se retrofecha); el periodo planificado vive en la cuota.
      const issueDate = now.toISOString().slice(0, 10);
      const dueDate = addDaysUtc(new Date(issueDate), DEFAULT_PAYMENT_TERM_DAYS);

      const out = await tenantTransaction(this.prisma, async (tx) => {
        const { invoice } = await this.ledger.emitInvoiceInTx(tx, user, {
          matter: matterArg,
          lines,
          withholdingTaxCode,
          issueDate,
          dueDate,
        });
        await tx.billingInstallment.updateMany({
          where: { id: next.id, tenantId: user.tenantId },
          data: {
            status: BillingInstallmentStatus.EMITTED,
            invoiceId: invoice.id,
            emittedAt: now,
          },
        });
        // Plan ABIERTO: si esta era la última cuota generada, crea la siguiente (rolling).
        if (schedule.occurrences == null) {
          const last = await tx.billingInstallment.findFirst({
            where: { tenantId: user.tenantId, scheduleId: schedule.id },
            orderBy: { sequence: 'desc' },
            select: { sequence: true },
          });
          if (last && last.sequence === next.sequence) {
            const seq = next.sequence + 1;
            await tx.billingInstallment.create({
              data: {
                tenantId: user.tenantId,
                scheduleId: schedule.id,
                sequence: seq,
                dueDate: this.addInterval(
                  schedule.startDate,
                  schedule.intervalUnit as BillingInterval,
                  schedule.intervalCount * (seq - 1),
                ),
                amount: next.amount,
                status: BillingInstallmentStatus.SCHEDULED,
              },
            });
          }
        }
        return invoice;
      });
      emitted.push({ invoiceId: out.id, number: out.number, sequence: next.sequence });
    }

    // Recalcula nextRunAt (próxima cuota SCHEDULED) o cierra el plan acotado agotado.
    const upcoming = await this.prisma.billingInstallment.findFirst({
      where: {
        tenantId: user.tenantId,
        scheduleId: schedule.id,
        status: BillingInstallmentStatus.SCHEDULED,
      },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true },
    });
    const completed = !upcoming && schedule.occurrences != null;
    await this.prisma.billingSchedule.updateMany({
      where: { id: schedule.id, tenantId: user.tenantId },
      data: {
        nextRunAt: upcoming?.dueDate ?? null,
        status: completed ? BillingScheduleStatus.COMPLETED : schedule.status,
      },
    });

    if (emitted.length > 0) {
      await this.audit.log(user, 'billing.emitted', 'BillingSchedule', schedule.id, {
        matterId: schedule.matterId,
        emitted: emitted.length,
        invoices: emitted.map((e) => e.number),
      });
    }
    return { scheduleId: schedule.id, emitted, completed };
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
