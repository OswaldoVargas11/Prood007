import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { DealMilestoneRemindersService } from './milestone-reminders.service';

/** Resumen agregado de un barrido de recordatorios de hitos sobre todos los tenants. */
export interface MilestoneReminderSweepSummary {
  tenants: number;
  evaluated: number;
  reminded: number;
  skipped: number;
  failed: number;
}

/**
 * Cron diario de alertas de plazo del calendario de operación (T-3). Barre los `DealMilestone` no
 * cumplidos con `targetDate` próximo de TODOS los despachos reutilizando `DealMilestoneRemindersService`.
 * Corre SIN contexto de request (igual que el cron de plazos de tareas y el dunning):
 *  - lista los tenants con el cliente de SISTEMA (rol BYPASSRLS);
 *  - evalúa cada tenant dentro de `runWithTenant(tenantId)` para que la RLS acote las queries a ese tenant.
 * Lo descubre `ScheduleModule.forRoot()` declarado en `app.module`. Va una hora después del cron de
 * tareas para no solaparse.
 */
@Injectable()
export class DealMilestonesCron {
  private readonly logger = new Logger(DealMilestonesCron.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly reminders: DealMilestoneRemindersService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM, { name: 'deal-milestone-reminders-daily' })
  async runDaily(): Promise<void> {
    const summary = await this.sweep();
    this.logger.log(
      `Recordatorios de hitos de operación: ${summary.tenants} despachos, ${summary.reminded} avisos` +
        (summary.failed ? `, ${summary.failed} fallidos` : ''),
    );
  }

  /**
   * Recorre todos los tenants y avisa de sus hitos próximos. Un fallo en un tenant no detiene el barrido
   * (se registra y se continúa).
   */
  async sweep(): Promise<MilestoneReminderSweepSummary> {
    const tenants = await this.system.tenant.findMany({ select: { id: true } });
    const summary: MilestoneReminderSweepSummary = {
      tenants: tenants.length,
      evaluated: 0,
      reminded: 0,
      skipped: 0,
      failed: 0,
    };
    for (const t of tenants) {
      try {
        const r = await runWithTenant(t.id, () =>
          this.reminders.evaluateTenant(t.id, { actor: { tenantId: t.id } }),
        );
        summary.evaluated += r.evaluated;
        summary.reminded += r.reminded;
        summary.skipped += r.skipped;
      } catch (err) {
        summary.failed++;
        this.logger.error(`Fallo al avisar hitos del tenant ${t.id}`, err as Error);
      }
    }
    return summary;
  }
}
