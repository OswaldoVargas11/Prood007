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

    // Facturación: importes del mes, pendiente de cobro y serie por mes (últimos 6).
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      select: { total: true, status: true, issueDate: true },
    });
    let billableThisMonth = 0;
    let outstanding = 0;
    const byMonth = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      byMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
    }
    for (const inv of invoices) {
      const total = Number(inv.total);
      if (inv.issueDate >= monthStart) billableThisMonth += total;
      if (inv.status === InvoiceStatus.ISSUED || inv.status === InvoiceStatus.SENT) {
        outstanding += total;
      }
      const key = `${inv.issueDate.getFullYear()}-${String(inv.issueDate.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + total);
    }
    const revenueByMonth = [...byMonth.entries()].map(([month, total]) => ({
      month,
      total: round2(total).toFixed(2),
    }));

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
        billableThisMonth: round2(billableThisMonth).toFixed(2),
        outstanding: round2(outstanding).toFixed(2),
      },
      revenueByMonth,
      deadlines,
      urgentCount,
      recentActivity,
    };
  }
}
