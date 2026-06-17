import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SETTLED_STATUSES, startOfTodayUtc } from '../ledger/overdue.util';
import type { RequestUser } from '../auth/auth.types';

/** Informes de gestión (solo lectura, agregados sobre datos existentes). Acotados por tenant + RLS. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cartera vencida (aged receivables): facturas no liquidadas con saldo pendiente, clasificadas por
   * antigüedad del vencimiento (corriente · 1-30 · 31-60 · 60+ días). Importes en la moneda del tenant.
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
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
    const items: {
      number: string;
      client: string;
      currency: string;
      dueDate: string | null;
      outstanding: number;
      daysOverdue: number;
    }[] = [];
    let totalOutstanding = 0;
    let currency = '';

    for (const inv of invoices) {
      const outstanding = Number(inv.total) - Number(inv.amountPaid);
      if (outstanding <= 0) continue;
      currency = currency || inv.currency;
      const due = inv.dueDate ? inv.dueDate.getTime() : today;
      const daysOverdue = Math.max(0, Math.floor((today - due) / 86_400_000));
      if (daysOverdue <= 0) buckets.current += outstanding;
      else if (daysOverdue <= 30) buckets.d1_30 += outstanding;
      else if (daysOverdue <= 60) buckets.d31_60 += outstanding;
      else buckets.d60plus += outstanding;
      totalOutstanding += outstanding;
      items.push({
        number: inv.number,
        client: inv.client.name,
        currency: inv.currency,
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        outstanding: round2(outstanding),
        daysOverdue,
      });
    }

    return {
      currency,
      totalOutstanding: round2(totalOutstanding),
      buckets: {
        current: round2(buckets.current),
        d1_30: round2(buckets.d1_30),
        d31_60: round2(buckets.d31_60),
        d60plus: round2(buckets.d60plus),
      },
      items,
    };
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
}

/** Redondeo a 2 decimales para presentación (los importes monetarios viven en Decimal en BD). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
