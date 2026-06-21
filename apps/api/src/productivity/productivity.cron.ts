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
        notified += await runWithTenant(t.id, () => this.notifyUnbilledTime(t.id));
      } catch (err) {
        this.logger.error(`Fallo en avisos de productividad del tenant ${t.id}`, err as Error);
      }
    }
    return { tenants: tenants.length, notified };
  }

  /** Dispara el digest para UN despacho (lo usa el endpoint manual; corre en contexto de request). */
  async runForTenant(tenantId: string): Promise<{ notified: number }> {
    return { notified: await this.notifyUnbilledTime(tenantId) };
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
}
