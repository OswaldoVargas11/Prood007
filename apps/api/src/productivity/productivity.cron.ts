import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Avisos de productividad. Hoy: digest SEMANAL de **tiempo sin facturar** por letrado — el dolor de que
 * "las horas facturables se fugan". Corre sin request (cliente de SISTEMA para listar tenants; cada uno
 * dentro de `runWithTenant` para que RLS acote las queries). Idempotente por semana: es un recordatorio
 * agregado (no por ficha), así que repetir cada lunes es un nudge intencionado, no spam.
 */
@Injectable()
export class ProductivityCron {
  private readonly logger = new Logger(ProductivityCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Lunes a las 8:00 (hora del servidor): empezar la semana con el repaso de horas por facturar.
  @Cron('0 8 * * 1', { name: 'productivity-weekly' })
  async runWeekly(): Promise<void> {
    const summary = await this.sweep();
    this.logger.log(
      `Productividad semanal: ${summary.tenants} despachos, ${summary.notified} avisos de tiempo sin facturar.`,
    );
  }

  async sweep(): Promise<{ tenants: number; notified: number }> {
    const tenants = await this.system.tenant.findMany({ select: { id: true } });
    let notified = 0;
    for (const t of tenants) {
      try {
        const r = await runWithTenant(t.id, () => this.runForTenant(t.id));
        notified += r.notified;
      } catch (err) {
        this.logger.error(`Fallo en avisos de productividad del tenant ${t.id}`, err as Error);
      }
    }
    return { tenants: tenants.length, notified };
  }

  /** Dispara los avisos para UN despacho (lo usa el endpoint manual; corre en contexto de request). */
  async runForTenant(
    tenantId: string,
  ): Promise<{ notified: number; unbilled: number; stale: number }> {
    const unbilled = await this.notifyUnbilledTime(tenantId);
    const stale = await this.notifyStaleMatters(tenantId);
    return { notified: unbilled + stale, unbilled, stale };
  }

  /** Crea un aviso por letrado con tiempo registrado y aún SIN facturar. Devuelve cuántos avisó. */
  private async notifyUnbilledTime(tenantId: string): Promise<number> {
    const rows = await this.prisma.timeEntry.findMany({
      where: { tenantId, billed: false },
      select: { userId: true, minutes: true },
    });
    if (rows.length === 0) return 0;

    const byUser = new Map<string, { count: number; minutes: number }>();
    for (const r of rows) {
      const agg = byUser.get(r.userId) ?? { count: 0, minutes: 0 };
      agg.count += 1;
      agg.minutes += r.minutes;
      byUser.set(r.userId, agg);
    }

    let notified = 0;
    for (const [userId, agg] of byUser) {
      const hours = (agg.minutes / 60).toFixed(1);
      await this.notifications.create({
        tenantId,
        userId,
        type: 'productivity.unbilled_time',
        title: `Tienes ${hours} h sin facturar`,
        body: `${agg.count} parte(s) de hora registrados aún sin facturar. Revísalos antes de que se enfríen.`,
        data: { count: agg.count, minutes: agg.minutes },
      });
      notified += 1;
    }
    return notified;
  }

  /**
   * Avisa al letrado responsable de los expedientes ACTIVOS (OPEN/IN_PROGRESS) sin actividad reciente.
   * "Actividad" = lo más reciente entre la última edición del expediente, el último parte de hora y el
   * último apunte del ledger. Umbral configurable con PRODUCTIVITY_STALE_DAYS (default 30).
   */
  private async notifyStaleMatters(tenantId: string): Promise<number> {
    const staleDays = Number(process.env.PRODUCTIVITY_STALE_DAYS ?? 30);
    const cutoff = new Date(Date.now() - staleDays * 86_400_000);

    const matters = await this.prisma.matter.findMany({
      where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS'] }, lawyerId: { not: null } },
      select: { id: true, reference: true, lawyerId: true, createdAt: true, updatedAt: true },
    });
    if (matters.length === 0) return 0;
    const ids = matters.map((m) => m.id);

    const [timeAgg, ledgerAgg] = await Promise.all([
      this.prisma.timeEntry.groupBy({
        by: ['matterId'],
        where: { tenantId, matterId: { in: ids } },
        _max: { workedAt: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['matterId'],
        where: { tenantId, matterId: { in: ids } },
        _max: { createdAt: true },
      }),
    ]);
    const timeMax = new Map(timeAgg.map((r) => [r.matterId, r._max.workedAt]));
    const ledgerMax = new Map(ledgerAgg.map((r) => [r.matterId, r._max.createdAt]));

    const byLawyer = new Map<string, string[]>();
    for (const m of matters) {
      const candidates = [m.updatedAt, timeMax.get(m.id), ledgerMax.get(m.id)].filter(
        (d): d is Date => d instanceof Date,
      );
      const last = candidates.reduce((a, b) => (a > b ? a : b), m.createdAt);
      if (last < cutoff && m.lawyerId) {
        const arr = byLawyer.get(m.lawyerId) ?? [];
        arr.push(m.reference);
        byLawyer.set(m.lawyerId, arr);
      }
    }

    let notified = 0;
    for (const [lawyerId, refs] of byLawyer) {
      await this.notifications.create({
        tenantId,
        userId: lawyerId,
        type: 'productivity.stale_matters',
        title: `${refs.length} expediente(s) sin actividad`,
        body: `Sin movimientos en ${staleDays}+ días: ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? '…' : ''}.`,
        data: { count: refs.length, references: refs.slice(0, 20) },
      });
      notified += 1;
    }
    return notified;
  }
}
