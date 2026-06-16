import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Jurisdiction } from '@legalflow/domain';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { DunningService } from './dunning.service';

/** Resumen agregado de un barrido de dunning sobre todos los tenants. */
export interface DunningSweepSummary {
  tenants: number;
  evaluated: number;
  created: number;
  delivered: number;
  skipped: number;
  failed: number;
}

/**
 * Cron diario de dunning. Persigue solas las facturas vencidas de TODOS los despachos reutilizando el
 * motor de D2 (`DunningService`). Corre SIN contexto de request, así que:
 *  - lista los tenants con el cliente de SISTEMA (rol BYPASSRLS) — la tabla Tenant también tiene RLS;
 *  - evalúa cada tenant dentro de `runWithTenant(tenantId)` para que la extensión de Prisma fije
 *    `app.tenant_id` y las queries del motor queden acotadas por RLS a ese tenant (sin fugas).
 */
@Injectable()
export class DunningCron {
  private readonly logger = new Logger(DunningCron.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly dunning: DunningService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM, { name: 'dunning-daily' })
  async runDaily(): Promise<void> {
    const summary = await this.sweep();
    this.logger.log(
      `Dunning diario: ${summary.tenants} despachos, ${summary.delivered} recordatorios entregados` +
        (summary.failed ? `, ${summary.failed} fallidos` : ''),
    );
  }

  /**
   * Recorre todos los tenants y persigue sus vencidas. Reutilizable (lo invoca el cron; también podría
   * invocarse desde un comando de mantenimiento). Un fallo en un tenant no detiene el barrido.
   */
  async sweep(): Promise<DunningSweepSummary> {
    const tenants = await this.system.tenant.findMany({
      select: { id: true, jurisdiction: true },
    });
    const summary: DunningSweepSummary = {
      tenants: tenants.length,
      evaluated: 0,
      created: 0,
      delivered: 0,
      skipped: 0,
      failed: 0,
    };
    for (const t of tenants) {
      try {
        const r = await runWithTenant(t.id, () =>
          this.dunning.evaluateTenant(t.id, t.jurisdiction as Jurisdiction, { tenantId: t.id }),
        );
        summary.evaluated += r.evaluated;
        summary.created += r.created;
        summary.delivered += r.delivered;
        summary.skipped += r.skipped;
        summary.failed += r.failed;
      } catch (err) {
        this.logger.error(`Fallo al perseguir vencidas del tenant ${t.id}`, err as Error);
      }
    }
    return summary;
  }
}
