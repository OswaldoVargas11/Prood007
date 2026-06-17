import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { DeadlineRemindersService } from './deadline-reminders.service';

/** Resumen agregado de un barrido de recordatorios de plazo sobre todos los tenants. */
export interface DeadlineReminderSweepSummary {
  tenants: number;
  evaluated: number;
  reminded: number;
  skipped: number;
  failed: number;
}

/**
 * Cron diario de recordatorios de plazos. Avisa de las tareas NO completadas con `dueDate` próximo de
 * TODOS los despachos reutilizando `DeadlineRemindersService`. Corre SIN contexto de request, igual
 * que el dunning:
 *  - lista los tenants con el cliente de SISTEMA (rol BYPASSRLS) — la tabla Tenant también tiene RLS;
 *  - evalúa cada tenant dentro de `runWithTenant(tenantId)` para que la extensión de Prisma fije
 *    `app.tenant_id` y las queries queden acotadas por RLS a ese tenant (sin fugas).
 * Lo descubre `ScheduleModule.forRoot()` declarado en `app.module`.
 */
@Injectable()
export class DeadlinesCron {
  private readonly logger = new Logger(DeadlinesCron.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly reminders: DeadlineRemindersService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM, { name: 'deadline-reminders-daily' })
  async runDaily(): Promise<void> {
    const summary = await this.sweep();
    this.logger.log(
      `Recordatorios de plazo: ${summary.tenants} despachos, ${summary.reminded} avisos emitidos` +
        (summary.failed ? `, ${summary.failed} fallidos` : ''),
    );
  }

  /**
   * Recorre todos los tenants y avisa de sus plazos próximos. Un fallo en un tenant no detiene el
   * barrido (se registra y se continúa).
   */
  async sweep(): Promise<DeadlineReminderSweepSummary> {
    const tenants = await this.system.tenant.findMany({ select: { id: true } });
    const summary: DeadlineReminderSweepSummary = {
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
        this.logger.error(`Fallo al avisar plazos del tenant ${t.id}`, err as Error);
      }
    }
    return summary;
  }
}
