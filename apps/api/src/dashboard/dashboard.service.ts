import { Injectable } from '@nestjs/common';
import { InvoiceStatus, MatterStatus, TaskStatus } from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE = [MatterStatus.OPEN, MatterStatus.IN_PROGRESS];
const OPEN_TASKS = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

/**
 * Resumen agregado del despacho para el panel principal. Todo acotado por tenant (filtro explícito +
 * RLS). Solo lectura. Reúne lo que el panel del diseño necesita: KPIs, plazos próximos, ingresos por
 * mes, revisiones pendientes y actividad reciente.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: RequestUser) {
    const tenantId = user.tenantId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [tenant, activeMatters, totalMatters, totalClients, openTasks, pendingReviews] =
      await Promise.all([
        this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { currency: true } }),
        this.prisma.matter.count({ where: { tenantId, status: { in: ACTIVE } } }),
        this.prisma.matter.count({ where: { tenantId } }),
        this.prisma.client.count({ where: { tenantId } }),
        this.prisma.task.count({ where: { tenantId, status: { in: OPEN_TASKS } } }),
        this.prisma.documentVersion.count({
          where: { tenantId, reviewStatus: { in: ['PENDING', 'IN_REVIEW'] } },
        }),
      ]);

    // Plazos procesales próximos (no resueltos), con expediente y cliente.
    const deadlineTasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        isProcedural: true,
        status: { in: OPEN_TASKS },
        dueDate: { not: null },
      },
      orderBy: { dueDate: 'asc' },
      take: 6,
      include: { matter: { select: { reference: true, client: { select: { name: true } } } } },
    });
    const deadlines = deadlineTasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      deadlineType: t.deadlineType,
      dueDate: t.dueDate,
      matterId: t.matterId,
      reference: t.matter?.reference ?? null,
      clientName: t.matter?.client?.name ?? null,
    }));
    const urgentCount = deadlines.filter(
      (d) => d.dueDate && new Date(d.dueDate).getTime() - now.getTime() <= ONE_WEEK_MS,
    ).length;

    // Facturación MULTI-MONEDA: NO se pueden sumar EUR/USD/DOP en un único total (sería una cifra sin
    // sentido). Los KPIs de "facturado este mes" y "pendiente de cobro" se DESGLOSAN por moneda; el
    // gráfico de tendencia, al ser una sola línea, usa la moneda principal del despacho.
    const primaryCurrency = tenant?.currency ?? 'EUR';
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      select: { total: true, status: true, issueDate: true, currency: true },
    });
    const billableByCcy = new Map<string, number>();
    const outstandingByCcy = new Map<string, number>();
    const byMonth = new Map<string, number>(); // serie mensual, solo moneda principal
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      byMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
    }
    let hasOtherCurrencies = false;
    for (const inv of invoices) {
      const total = Number(inv.total);
      const ccy = inv.currency as string;
      if (ccy !== primaryCurrency) hasOtherCurrencies = true;
      if (inv.issueDate >= monthStart) {
        billableByCcy.set(ccy, (billableByCcy.get(ccy) ?? 0) + total);
      }
      if (inv.status === InvoiceStatus.ISSUED || inv.status === InvoiceStatus.SENT) {
        outstandingByCcy.set(ccy, (outstandingByCcy.get(ccy) ?? 0) + total);
      }
      if (ccy === primaryCurrency) {
        const key = `${inv.issueDate.getFullYear()}-${String(inv.issueDate.getMonth() + 1).padStart(2, '0')}`;
        if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + total);
      }
    }
    const revenueByMonth = [...byMonth.entries()].map(([month, total]) => ({
      month,
      total: round2(total).toFixed(2),
    }));
    // Desglose por moneda: la principal primero (aunque sea 0, para que el KPI siempre muestre algo),
    // luego el resto con importe ≠ 0 en orden estable.
    const toBreakdown = (m: Map<string, number>): { currency: string; amount: string }[] => {
      const out: { currency: string; amount: string }[] = [
        { currency: primaryCurrency, amount: round2(m.get(primaryCurrency) ?? 0).toFixed(2) },
      ];
      for (const ccy of [...m.keys()].sort()) {
        if (ccy === primaryCurrency) continue;
        out.push({ currency: ccy, amount: round2(m.get(ccy) ?? 0).toFixed(2) });
      }
      return out;
    };

    // Actividad reciente (auditoría) con el nombre del actor.
    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const actorIds = [
      ...new Set(logs.map((l) => l.actorId).filter((x): x is string => Boolean(x))),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId, id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const actorName = new Map(actors.map((a) => [a.id, a.fullName]));
    const recentActivity = logs.map((l) => ({
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      createdAt: l.createdAt,
      actor: l.actorId ? (actorName.get(l.actorId) ?? null) : null,
    }));

    return {
      currency: tenant?.currency ?? 'EUR',
      kpis: {
        activeMatters,
        totalMatters,
        totalClients,
        openTasks,
        upcomingDeadlines: deadlines.length,
        urgentDeadlines: urgentCount,
        pendingReviews,
        billableThisMonth: toBreakdown(billableByCcy),
        outstanding: toBreakdown(outstandingByCcy),
      },
      hasOtherCurrencies,
      revenueByMonth,
      deadlines,
      urgentCount,
      recentActivity,
    };
  }
}
