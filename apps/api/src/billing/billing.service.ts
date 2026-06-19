import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Currency } from '@prisma/client';
import {
  BillingFiscalMode,
  BillingInterval,
  BillingInstallmentStatus,
  BillingScheduleStatus,
  BillingScheduleType,
  type Jurisdiction,
} from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { RetainerService } from '../retainer/retainer.service';
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
 * Actor mínimo para la EMISIÓN (tenant + jurisdicción). Lo satisface `RequestUser` (rutas HTTP) y también
 * el cron de barrido, que no tiene request. La auditoría acepta este actor (actorId nulo = sistema).
 */
type BillingEmitActor = { tenantId: string; jurisdiction: Jurisdiction };

/** Datos del expediente que `LedgerService.emitInvoiceInTx` necesita para emitir. */
interface EmitMatterArg {
  id: string;
  clientId: string;
  tenant: { name: string; taxId: string; currency: Currency };
  client: { name: string; taxId: string };
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
    private readonly retainer: RetainerService,
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
    // Moneda del plan: la elegida o, por defecto, la del despacho. Todas sus facturas van en ella.
    const currency = dto.currency ?? matter.tenant.currency;
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
  async runDueEmissions(user: BillingEmitActor, scheduleId: string) {
    const schedule = await this.prisma.billingSchedule.findFirst({
      where: { id: scheduleId, tenantId: user.tenantId },
    });
    if (!schedule) throw new NotFoundException(apiError('billing.scheduleNotFound'));
    if (schedule.status !== BillingScheduleStatus.ACTIVE) {
      throw new BadRequestException(apiError('billing.scheduleNotActive'));
    }
    // (b) ADVANCE: la emisión de cada anticipo va ligada a su COBRO (devengo al cobro) → RP4b.
    if (
      schedule.type === BillingScheduleType.INSTALLMENTS &&
      schedule.fiscalMode === BillingFiscalMode.ADVANCE
    ) {
      throw new BadRequestException(apiError('billing.advanceRunNotYet'));
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
        // Las facturas del plan se emiten en la moneda DEL PLAN (no necesariamente la del despacho).
        currency: schedule.currency as Currency,
      },
      client: { name: matter.client.name, taxId: matter.client.taxId as string },
    };

    const result =
      schedule.type === BillingScheduleType.RECURRING
        ? await this.emitRecurringDue(user, schedule, matterArg, lines, withholdingTaxCode)
        : await this.emitInstallmentsServiceRendered(
            user,
            schedule,
            matterArg,
            lines,
            withholdingTaxCode,
          );

    if (result.emitted.length > 0) {
      await this.audit.log(user, 'billing.emitted', 'BillingSchedule', schedule.id, {
        matterId: schedule.matterId,
        emitted: result.emitted.length,
        invoices: result.emitted.map((e) => e.number),
      });
    }
    return { scheduleId: schedule.id, ...result };
  }

  /**
   * Barrido de un tenant (lo invoca el cron, DENTRO de `runWithTenant` → RLS acotada a ese tenant). Emite
   * los planes ACTIVE cuyo `nextRunAt` ha vencido: RECURRING (1 factura/periodo) e INSTALLMENTS·
   * SERVICE_RENDERED (factura única). Los ADVANCE NO se barren (su emisión va ligada al cobro). Un fallo en
   * un plan no detiene el barrido del resto.
   */
  async sweepTenant(
    actor: BillingEmitActor,
  ): Promise<{ schedules: number; emitted: number; failed: number }> {
    const now = new Date();
    const due = await this.prisma.billingSchedule.findMany({
      where: {
        tenantId: actor.tenantId,
        status: BillingScheduleStatus.ACTIVE,
        nextRunAt: { lte: now },
        NOT: {
          type: BillingScheduleType.INSTALLMENTS,
          fiscalMode: BillingFiscalMode.ADVANCE,
        },
      },
      select: { id: true },
    });
    let emitted = 0;
    let failed = 0;
    for (const s of due) {
      try {
        const r = await this.runDueEmissions(actor, s.id);
        emitted += r.emitted.length;
      } catch {
        failed += 1;
      }
    }
    return { schedules: due.length, emitted, failed };
  }

  /**
   * RECURRING: emite 1 factura por periodo VENCIDO (`dueDate ≤ ahora`), atómico por periodo; en planes
   * abiertos hace catch-up + rolling de la siguiente cuota; avanza `nextRunAt` y cierra (COMPLETED) el
   * acotado agotado.
   */
  private async emitRecurringDue(
    user: BillingEmitActor,
    schedule: {
      id: string;
      startDate: Date;
      intervalUnit: string | null;
      intervalCount: number;
      occurrences: number | null;
      status: string;
    },
    matterArg: EmitMatterArg,
    lines: ScheduleLine[],
    withholdingTaxCode: string | undefined,
  ) {
    const now = new Date();
    const emitted: { invoiceId: string; number: string; sequence: number }[] = [];

    // Bucle: emite cada periodo vencido en su propia transacción (atómico por factura).
    // Cota de seguridad (evita un bucle infinito por datos corruptos).
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
        status: completed ? BillingScheduleStatus.COMPLETED : BillingScheduleStatus.ACTIVE,
      },
    });
    return { emitted, completed };
  }

  /**
   * INSTALLMENTS · SERVICE_RENDERED (D-027 (a)): el servicio ya se prestó → se emite UNA factura por el
   * importe completo (IVA/ITBIS íntegro al emitir, LIVA art. 75) y las cuotas pasan a ser un CALENDARIO DE
   * COBRO (cada una se cobra después por Checkout/manual como `Payment` parcial; no son facturas nuevas).
   * Idempotente: si ya se emitió la factura, no la duplica. No hay más emisiones → `nextRunAt = null`.
   */
  private async emitInstallmentsServiceRendered(
    user: BillingEmitActor,
    schedule: { id: string },
    matterArg: EmitMatterArg,
    lines: ScheduleLine[],
    withholdingTaxCode: string | undefined,
  ) {
    const existing = await this.prisma.billingInstallment.findFirst({
      where: { tenantId: user.tenantId, scheduleId: schedule.id, invoiceId: { not: null } },
      select: { invoiceId: true },
    });
    if (existing) {
      // Ya emitida: nada que hacer (la factura del servicio es única).
      return {
        emitted: [] as { invoiceId: string; number: string; sequence: number }[],
        completed: false,
      };
    }

    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    // La factura del servicio vence cuando vence la ÚLTIMA cuota (plazo final del fraccionamiento).
    const lastDue = await this.prisma.billingInstallment.findFirst({
      where: { tenantId: user.tenantId, scheduleId: schedule.id },
      orderBy: { dueDate: 'desc' },
      select: { dueDate: true },
    });
    const dueDate = lastDue?.dueDate ?? addDaysUtc(new Date(issueDate), DEFAULT_PAYMENT_TERM_DAYS);

    const out = await tenantTransaction(this.prisma, async (tx) => {
      const { invoice } = await this.ledger.emitInvoiceInTx(tx, user, {
        matter: matterArg,
        lines,
        withholdingTaxCode,
        issueDate,
        dueDate,
      });
      // Todas las cuotas (calendario de cobro) quedan ligadas a la factura única; siguen SCHEDULED
      // (pendientes de cobro). El cobro parcial por cuota va por el flujo de Payment (Checkout/manual).
      await tx.billingInstallment.updateMany({
        where: { tenantId: user.tenantId, scheduleId: schedule.id },
        data: { invoiceId: invoice.id, emittedAt: now },
      });
      return invoice;
    });

    // Emitida la factura única, ya no hay más emisiones (el cobro es manual/Checkout).
    await this.prisma.billingSchedule.updateMany({
      where: { id: schedule.id, tenantId: user.tenantId },
      data: { nextRunAt: null },
    });
    return {
      emitted: [{ invoiceId: out.id, number: out.number, sequence: 0 }],
      completed: false,
    };
  }

  /**
   * Cobra una cuota de un plan de pago por ANTICIPOS (INSTALLMENTS · ADVANCE, D-027/D-028 (b)): al cobrar,
   * emite la **factura de anticipo** de esa cuota (devengo al cobro) reutilizando `RetainerService.depositAnticipo`
   * (factura de anticipo + Payment + apuntes + crédito al retainer, atómico). La deducción de los anticipos
   * en la factura final ya existe (R3b). **Claim-first** (reserva SCHEDULED→EMITTED de forma atómica antes
   * de emitir): fail-safe contra doble emisión bajo reintento/concurrencia. Avanza el plan; lo cierra
   * (COMPLETED) cuando no quedan cuotas por cobrar.
   */
  async collectAnticipoInstallment(user: RequestUser, installmentId: string) {
    const installment = await this.prisma.billingInstallment.findFirst({
      where: { id: installmentId, tenantId: user.tenantId },
      include: { schedule: true },
    });
    if (!installment) throw new NotFoundException(apiError('billing.installmentNotFound'));
    const schedule = installment.schedule;
    if (
      schedule.type !== BillingScheduleType.INSTALLMENTS ||
      schedule.fiscalMode !== BillingFiscalMode.ADVANCE
    ) {
      throw new BadRequestException(apiError('billing.installmentNotAdvance'));
    }
    if (schedule.status !== BillingScheduleStatus.ACTIVE) {
      throw new BadRequestException(apiError('billing.scheduleNotActive'));
    }

    // Claim-first: solo UN cobro reclama la cuota (SCHEDULED→EMITTED) de forma atómica; evita que un
    // reintento o una llamada concurrente emitan un segundo anticipo de la misma cuota.
    const claim = await this.prisma.billingInstallment.updateMany({
      where: {
        id: installment.id,
        tenantId: user.tenantId,
        status: BillingInstallmentStatus.SCHEDULED,
      },
      data: { status: BillingInstallmentStatus.EMITTED },
    });
    if (claim.count !== 1) {
      throw new BadRequestException(apiError('billing.installmentNotScheduled'));
    }

    let anticipo: { invoiceId: string; number: string; total: string; balance: string };
    try {
      anticipo = await this.retainer.depositAnticipo(user, {
        matterId: schedule.matterId,
        amount: installment.amount.toFixed(2),
        withholdingTaxCode: schedule.withholdingTaxCode ?? undefined,
        description: `Anticipo cuota ${installment.sequence} (plan de pago)`,
      });
    } catch (err) {
      // Falló ANTES de emitir (validación, etc.) → libera la reserva para poder reintentar.
      await this.prisma.billingInstallment.updateMany({
        where: { id: installment.id, tenantId: user.tenantId },
        data: { status: BillingInstallmentStatus.SCHEDULED },
      });
      throw err;
    }

    // Emitido el anticipo: liga su factura y marca la cuota COBRADA. Si este update fallara, la cuota
    // queda EMITTED con la factura ya existente (recuperable); NUNCA se re-emite (evita doble anticipo).
    const now = new Date();
    await this.prisma.billingInstallment.updateMany({
      where: { id: installment.id, tenantId: user.tenantId },
      data: {
        status: BillingInstallmentStatus.PAID,
        invoiceId: anticipo.invoiceId,
        emittedAt: now,
        paidAt: now,
      },
    });

    // Avanza el plan: próxima cuota pendiente o cierre si no quedan.
    const upcoming = await this.prisma.billingInstallment.findFirst({
      where: {
        tenantId: user.tenantId,
        scheduleId: schedule.id,
        status: BillingInstallmentStatus.SCHEDULED,
      },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true },
    });
    const completed = !upcoming;
    await this.prisma.billingSchedule.updateMany({
      where: { id: schedule.id, tenantId: user.tenantId },
      data: {
        nextRunAt: upcoming?.dueDate ?? null,
        status: completed ? BillingScheduleStatus.COMPLETED : BillingScheduleStatus.ACTIVE,
      },
    });

    await this.audit.log(user, 'billing.anticipo_collected', 'BillingInstallment', installment.id, {
      scheduleId: schedule.id,
      sequence: installment.sequence,
      number: anticipo.number,
    });
    return {
      installmentId: installment.id,
      invoiceId: anticipo.invoiceId,
      number: anticipo.number,
      total: anticipo.total,
      balance: anticipo.balance,
      completed,
    };
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
