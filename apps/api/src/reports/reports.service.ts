import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { SETTLED_STATUSES, startOfTodayUtc } from '../ledger/overdue.util';
import type { RequestUser } from '../auth/auth.types';

// Facturas "emitidas" (cuentan como facturado): todo menos borrador y anulada.
const ISSUED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIAL,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PAID,
];

/** Informes de gestión (solo lectura, agregados sobre datos existentes). Acotados por tenant + RLS. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cartera vencida (aged receivables): facturas no liquidadas con saldo pendiente, clasificadas por
   * antigüedad del vencimiento (corriente · 1-30 · 31-60 · 60+ días). AGRUPADO POR MONEDA: como el
   * despacho puede facturar en EUR/USD/DOP, los totales NO se mezclan — un grupo por cada moneda.
   */
  async agedReceivables(user: RequestUser) {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: user.tenantId, status: { notIn: SETTLED_STATUSES } },
      select: {
        number: true,
        currency: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        client: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const today = startOfTodayUtc().getTime();
    interface Group {
      currency: string;
      totalOutstanding: number;
      buckets: { current: number; d1_30: number; d31_60: number; d60plus: number };
      items: {
        number: string;
        client: string;
        currency: string;
        dueDate: string | null;
        outstanding: number;
        daysOverdue: number;
      }[];
    }
    const groups = new Map<string, Group>();

    for (const inv of invoices) {
      const outstanding = Number(inv.total) - Number(inv.amountPaid);
      if (outstanding <= 0) continue;
      const g = groups.get(inv.currency) ?? {
        currency: inv.currency,
        totalOutstanding: 0,
        buckets: { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 },
        items: [],
      };
      const due = inv.dueDate ? inv.dueDate.getTime() : today;
      const daysOverdue = Math.max(0, Math.floor((today - due) / 86_400_000));
      if (daysOverdue <= 0) g.buckets.current += outstanding;
      else if (daysOverdue <= 30) g.buckets.d1_30 += outstanding;
      else if (daysOverdue <= 60) g.buckets.d31_60 += outstanding;
      else g.buckets.d60plus += outstanding;
      g.totalOutstanding += outstanding;
      g.items.push({
        number: inv.number,
        client: inv.client.name,
        currency: inv.currency,
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        outstanding: round2(outstanding),
        daysOverdue,
      });
      groups.set(inv.currency, g);
    }

    const byCurrency = [...groups.values()]
      .map((g) => ({
        currency: g.currency,
        totalOutstanding: round2(g.totalOutstanding),
        buckets: {
          current: round2(g.buckets.current),
          d1_30: round2(g.buckets.d1_30),
          d31_60: round2(g.buckets.d31_60),
          d60plus: round2(g.buckets.d60plus),
        },
        items: g.items,
      }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    return { byCurrency };
  }

  /** Tiempo registrado por letrado: horas y honorarios (minutos × tarifa/60), con % facturado. */
  async timeByLawyer(user: RequestUser) {
    const entries = await this.prisma.timeEntry.findMany({
      where: { tenantId: user.tenantId },
      select: {
        minutes: true,
        hourlyRate: true,
        billed: true,
        user: { select: { id: true, fullName: true } },
      },
    });

    const byLawyer = new Map<
      string,
      { lawyerId: string; name: string; minutes: number; amount: number; billedMinutes: number }
    >();
    for (const e of entries) {
      const row = byLawyer.get(e.user.id) ?? {
        lawyerId: e.user.id,
        name: e.user.fullName,
        minutes: 0,
        amount: 0,
        billedMinutes: 0,
      };
      row.minutes += e.minutes;
      row.amount += (e.minutes / 60) * Number(e.hourlyRate);
      if (e.billed) row.billedMinutes += e.minutes;
      byLawyer.set(e.user.id, row);
    }

    return [...byLawyer.values()]
      .map((r) => ({
        lawyerId: r.lawyerId,
        name: r.name,
        hours: round2(r.minutes / 60),
        amount: round2(r.amount),
        billedPct: r.minutes > 0 ? Math.round((r.billedMinutes / r.minutes) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Rentabilidad por expediente (en la MONEDA BASE del despacho `tenant.currency`). Por cada expediente
   * con actividad: horas, valor del trabajo (minutos×tarifa), WIP (trabajo aún no facturado), facturado
   * (facturas emitidas) y cobrado, más el % de realización (facturado/valor). Las facturas en otra moneda
   * (caso de despachos duales) se cuentan aparte para no mezclar divisas.
   */
  async profitability(user: RequestUser) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { currency: true },
    });
    const base = tenant.currency;

    const [timeEntries, invoices] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { tenantId: user.tenantId },
        select: {
          matterId: true,
          minutes: true,
          hourlyRate: true,
          billed: true,
          user: { select: { costRate: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId: user.tenantId, status: { in: ISSUED_STATUSES } },
        select: { matterId: true, total: true, amountPaid: true, currency: true },
      }),
    ]);

    interface Acc {
      hours: number;
      workValue: number;
      wip: number;
      cost: number;
      billed: number;
      collected: number;
    }
    const acc = new Map<string, Acc>();
    const bucket = (id: string): Acc => {
      let a = acc.get(id);
      if (!a) {
        a = { hours: 0, workValue: 0, wip: 0, cost: 0, billed: 0, collected: 0 };
        acc.set(id, a);
      }
      return a;
    };

    // ¿Hay tarifas de coste configuradas? Si faltan en algunos letrados, el coste/margen queda incompleto.
    let costRatesSet = false;
    let entriesMissingCost = 0;
    for (const e of timeEntries) {
      const hours = e.minutes / 60;
      const value = hours * Number(e.hourlyRate);
      const a = bucket(e.matterId);
      a.hours += hours;
      a.workValue += value;
      if (!e.billed) a.wip += value;
      const costRate = e.user.costRate;
      if (costRate != null) {
        costRatesSet = true;
        a.cost += hours * Number(costRate);
      } else {
        entriesMissingCost += 1;
      }
    }
    let foreignInvoices = 0;
    for (const inv of invoices) {
      if (!inv.matterId) continue;
      if (inv.currency !== base) {
        foreignInvoices += 1;
        continue;
      }
      const a = bucket(inv.matterId);
      a.billed += Number(inv.total);
      a.collected += Number(inv.amountPaid);
    }

    const matters = await this.prisma.matter.findMany({
      where: { tenantId: user.tenantId, id: { in: [...acc.keys()] } },
      select: {
        id: true,
        reference: true,
        client: { select: { name: true } },
        lawyer: { select: { fullName: true } },
      },
    });
    const meta = new Map(matters.map((m) => [m.id, m]));

    const rows = [...acc.entries()]
      .filter(([id]) => meta.has(id))
      .map(([id, a]) => {
        const m = meta.get(id)!;
        const margin = a.billed - a.cost;
        return {
          matterId: id,
          reference: m.reference,
          client: m.client.name,
          lawyer: m.lawyer?.fullName ?? null,
          hours: round2(a.hours),
          workValue: round2(a.workValue),
          wip: round2(a.wip),
          cost: round2(a.cost),
          billed: round2(a.billed),
          collected: round2(a.collected),
          margin: round2(margin),
          realizationPct: a.workValue > 0 ? Math.round((a.billed / a.workValue) * 100) : null,
          marginPct: a.billed > 0 ? Math.round((margin / a.billed) * 100) : null,
        };
      })
      .sort((x, y) => y.workValue - x.workValue);

    const sum = rows.reduce(
      (t, r) => ({
        hours: t.hours + r.hours,
        workValue: t.workValue + r.workValue,
        wip: t.wip + r.wip,
        cost: t.cost + r.cost,
        billed: t.billed + r.billed,
        collected: t.collected + r.collected,
      }),
      { hours: 0, workValue: 0, wip: 0, cost: 0, billed: 0, collected: 0 },
    );
    const totalMargin = sum.billed - sum.cost;

    return {
      currency: base,
      // Margen (rentabilidad real) = facturado − coste del tiempo (horas × tarifa de coste del letrado).
      // Solo es fiable si hay tarifas de coste configuradas (costRatesSet); si faltan, está infravalorado.
      costRatesSet,
      entriesMissingCost,
      totals: {
        hours: round2(sum.hours),
        workValue: round2(sum.workValue),
        wip: round2(sum.wip),
        cost: round2(sum.cost),
        billed: round2(sum.billed),
        collected: round2(sum.collected),
        margin: round2(totalMargin),
        realizationPct: sum.workValue > 0 ? Math.round((sum.billed / sum.workValue) * 100) : null,
        collectionPct: sum.billed > 0 ? Math.round((sum.collected / sum.billed) * 100) : null,
        marginPct: sum.billed > 0 ? Math.round((totalMargin / sum.billed) * 100) : null,
      },
      matters: rows,
      foreignInvoices,
    };
  }
}

/** Redondeo a 2 decimales para presentación (los importes monetarios viven en Decimal en BD). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
