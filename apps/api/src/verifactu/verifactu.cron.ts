import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VerifactuStatus } from '@prisma/client';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { VerifactuConfig } from './verifactu.config';
import { VerifactuSubmissionService } from './verifactu-submission.service';

/** Reintentos automáticos máximos por registro (fallos de transporte); después queda a revisión manual. */
const MAX_ATTEMPTS = 10;
/** Registros por barrido (los que no quepan entran en el siguiente tick). */
const BATCH_SIZE = 200;

export interface VerifactuSweepSummary {
  pending: number;
  accepted: number;
  rejected: number;
  retrying: number;
}

/**
 * Cron de remisión/reintento Verifactu: barre los registros PENDING de todos los despachos y los remite a
 * la AEAT. Cubre las emisiones que no pasan por `createInvoice` (retainer, facturación programada) y los
 * fallos transitorios del envío inline. GATED por `VERIFACTU_ENV` (sin él, no hace nada) e IDEMPOTENTE:
 *  - solo toca registros PENDING; los estados con acuse son finales y `transmit` no re-remite;
 *  - la escritura del acuse lleva guard de estado (no pisa un acuse ya persistido por otro proceso);
 *  - un duplicado en la AEAT (acuse perdido y reenvío) se reconcilia como aceptado, no como rechazo.
 * Mismo patrón multi-tenant que BillingCron: lista con el rol de SISTEMA (BYPASSRLS) y procesa cada
 * tenant dentro de `runWithTenant` para que RLS acote las queries del envío.
 */
@Injectable()
export class VerifactuCron {
  private readonly logger = new Logger(VerifactuCron.name);
  /** Un barrido a la vez por instancia: un sweep lento (red AEAT) no debe solaparse con el tick siguiente. */
  private sweeping = false;

  constructor(
    private readonly system: SystemPrismaService,
    private readonly config: VerifactuConfig,
    private readonly submission: VerifactuSubmissionService,
  ) {}

  @Cron('*/10 * * * *', { name: 'verifactu-retry' })
  async runEvery10Min(): Promise<void> {
    if (!this.config.enabled) return;
    if (this.sweeping) return; // el barrido anterior sigue vivo (los duplicados los reconcilia mapAcuse).
    this.sweeping = true;
    let summary: VerifactuSweepSummary;
    try {
      summary = await this.sweep();
    } finally {
      this.sweeping = false;
    }
    if (summary.pending > 0) {
      this.logger.log(
        `Remisión Verifactu: ${summary.pending} pendientes → ${summary.accepted} aceptados, ` +
          `${summary.rejected} rechazados, ${summary.retrying} a reintentar`,
      );
    }
  }

  /** Barre y remite los registros pendientes. Un fallo en una factura no detiene el barrido. */
  async sweep(): Promise<VerifactuSweepSummary> {
    const pending = await this.system.invoice.findMany({
      where: {
        verifactuStatus: VerifactuStatus.PENDING,
        verifactuAttempts: { lt: MAX_ATTEMPTS },
        // Solo despachos CON certificado: sin él `transmit` no puede remitir (TLS mutuo) y no cuenta
        // intento, así que un despacho sin certificado repetiría eternamente y, por antigüedad, podría
        // acaparar el batch entero bloqueando a los demás (head-of-line). Sus registros quedan PENDING
        // dormidos y entran al barrido automáticamente en cuanto suba el .p12.
        tenant: { verifactuCertKey: { not: null } },
      },
      select: { id: true, tenantId: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });
    const summary: VerifactuSweepSummary = {
      pending: pending.length,
      accepted: 0,
      rejected: 0,
      retrying: 0,
    };
    for (const inv of pending) {
      try {
        const r = await runWithTenant(inv.tenantId, () =>
          this.submission.transmit(inv.tenantId, inv.id),
        );
        if (
          r.status === VerifactuStatus.ACCEPTED ||
          r.status === VerifactuStatus.ACCEPTED_WITH_ERRORS
        ) {
          summary.accepted += 1;
        } else if (r.status === VerifactuStatus.REJECTED) {
          summary.rejected += 1;
        } else {
          summary.retrying += 1;
        }
      } catch (err) {
        summary.retrying += 1;
        this.logger.error(
          `Fallo remitiendo el registro Verifactu de la factura ${inv.id}`,
          err as Error,
        );
      }
    }
    return summary;
  }
}
