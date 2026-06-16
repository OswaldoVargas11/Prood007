import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Jurisdiction } from '@legalflow/domain';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { BillingService } from './billing.service';

/** Resumen agregado de un barrido de facturación programada sobre todos los tenants. */
export interface BillingSweepSummary {
  tenants: number;
  schedules: number;
  emitted: number;
  failed: number;
}

/**
 * Cron diario de facturación programada (D-028). Emite solo las facturas de los planes vencidos de TODOS
 * los despachos reutilizando `BillingService` (cada emisión pasa por `buildInvoiceRecord`: serie +
 * Verifactu/e-CF + QR, sin atajos). Corre SIN contexto de request, así que:
 *  - lista los tenants con el cliente de SISTEMA (rol BYPASSRLS) — la tabla Tenant también tiene RLS;
 *  - barre cada tenant dentro de `runWithTenant(tenantId)` para que la extensión de Prisma fije
 *    `app.tenant_id` y las queries queden acotadas por RLS a ese tenant (sin fugas).
 * Mismo patrón que el cron de dunning. Los planes de pago por ANTICIPOS no se barren (su emisión va al
 * cobro de cada cuota).
 */
@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly billing: BillingService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM, { name: 'billing-daily' })
  async runDaily(): Promise<void> {
    const summary = await this.sweep();
    this.logger.log(
      `Facturación programada diaria: ${summary.tenants} despachos, ${summary.emitted} facturas emitidas` +
        (summary.failed ? `, ${summary.failed} planes con fallo` : ''),
    );
  }

  /**
   * Recorre todos los tenants y emite sus planes vencidos. Reutilizable (lo invoca el cron). Un fallo en
   * un tenant no detiene el barrido global.
   */
  async sweep(): Promise<BillingSweepSummary> {
    const tenants = await this.system.tenant.findMany({
      select: { id: true, jurisdiction: true },
    });
    const summary: BillingSweepSummary = {
      tenants: tenants.length,
      schedules: 0,
      emitted: 0,
      failed: 0,
    };
    for (const t of tenants) {
      try {
        const r = await runWithTenant(t.id, () =>
          this.billing.sweepTenant({
            tenantId: t.id,
            jurisdiction: t.jurisdiction as Jurisdiction,
          }),
        );
        summary.schedules += r.schedules;
        summary.emitted += r.emitted;
        summary.failed += r.failed;
      } catch (err) {
        this.logger.error(`Fallo al barrer la facturación del tenant ${t.id}`, err as Error);
      }
    }
    return summary;
  }
}
