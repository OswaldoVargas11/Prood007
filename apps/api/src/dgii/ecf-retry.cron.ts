import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EcfStatus } from '@prisma/client';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { DgiiConfig } from './dgii.config';
import { EcfTransmissionService } from './ecf-transmission.service';
import { ECF_MAX_AUTO_ATTEMPTS, decideEcfRetry } from './ecf-retry.logic';

/** Resumen agregado de un barrido del cron de reintento e-CF. */
export interface EcfRetrySweepSummary {
  candidates: number;
  retried: number;
  polled: number;
  waiting: number;
  exhausted: number;
  failed: number;
}

/**
 * Cron de reintento/polling de la transmisión e-CF a la DGII (Ley 32-23). Cada 10 min barre las facturas
 * con `ecfStatus=PENDING` de todos los tenants y, según su fase y backoff (`ecf-retry.logic`):
 *  - sin TrackId → RETRANSMITE (fallo de transporte previo), con tope de intentos;
 *  - con TrackId → CONSULTA EL ACUSE hasta ACCEPTED/REJECTED.
 * Cada intento/acuse queda en la cadena fiscal inmutable (lo registra EcfTransmissionService).
 *
 * GATED por DGII_ENV: apagado no hace ni la consulta a BD (coste cero, comportamiento actual intacto).
 * Sin contexto de request (igual que el cron de resumen de chat): localiza candidatos con el cliente de
 * SISTEMA (BYPASSRLS) y procesa cada factura dentro de `runWithTenant(tenantId)` para que la RLS acote
 * las escrituras. Lo descubre `ScheduleModule.forRoot()` de `app.module`.
 */
@Injectable()
export class EcfRetryCron {
  private readonly logger = new Logger(EcfRetryCron.name);
  /** Un barrido a la vez por instancia: un sweep lento (red) no debe solaparse con el tick siguiente. */
  private sweeping = false;

  constructor(
    private readonly system: SystemPrismaService,
    private readonly config: DgiiConfig,
    private readonly transmission: EcfTransmissionService,
  ) {}

  @Cron('*/10 * * * *', { name: 'ecf-retry' })
  async runPeriodic(): Promise<void> {
    if (!this.config.enabled) return; // transmisión apagada: nada que reintentar.
    if (this.sweeping) return; // el barrido anterior sigue vivo (entre máquinas protege el CAS de transmit).
    this.sweeping = true;
    let s: EcfRetrySweepSummary;
    try {
      s = await this.sweep();
    } finally {
      this.sweeping = false;
    }
    if (s.candidates > 0) {
      this.logger.log(
        `e-CF: ${s.candidates} pendientes — ${s.retried} retransmitidas, ${s.polled} acuses consultados, ` +
          `${s.waiting} en backoff, ${s.exhausted} agotadas` +
          (s.failed ? `, ${s.failed} fallidas` : ''),
      );
    }
  }

  /** Un fallo en una factura no detiene el barrido (se registra y se continúa). */
  async sweep(now: Date = new Date()): Promise<EcfRetrySweepSummary> {
    const pending = await this.system.invoice.findMany({
      where: {
        complianceFormat: 'ECF',
        // Las agotadas (contador por encima del tope tras markRetryExhausted) salen del barrido:
        // quedan para gestión manual, sin recargarse eternamente en cada tick.
        ecfAttempts: { lte: ECF_MAX_AUTO_ATTEMPTS },
        OR: [
          { ecfStatus: EcfStatus.PENDING },
          // Backlog STUBBED: facturas emitidas con la transmisión apagada o sin certificado. Entran al
          // barrido solo cuando su despacho ya tiene certificado cargado (con DGII_ENV activo, ver
          // runPeriodic) — así el encendido de prod transmite el histórico sin acción manual.
          { ecfStatus: EcfStatus.STUBBED, tenant: { certificateKey: { not: null } } },
        ],
      },
      select: {
        id: true,
        tenantId: true,
        ecfAttempts: true,
        ecfSubmittedAt: true,
        ecfTrackId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 500, // techo de seguridad por barrido; lo no cubierto entra en el siguiente tick.
    });
    const summary: EcfRetrySweepSummary = {
      candidates: pending.length,
      retried: 0,
      polled: 0,
      waiting: 0,
      exhausted: 0,
      failed: 0,
    };
    for (const inv of pending) {
      try {
        const decision = decideEcfRetry(inv, now);
        if (decision === 'wait') {
          summary.waiting++;
        } else if (decision === 'exhausted') {
          // Solo la PRIMERA vez que se detecta (== tope exacto): cierra la fase. Después el contador ya
          // quedó por encima del tope (o la factura salió de PENDING) y el barrido la ignora.
          if (inv.ecfAttempts === ECF_MAX_AUTO_ATTEMPTS) {
            await runWithTenant(inv.tenantId, () =>
              this.transmission.markRetryExhausted(inv.tenantId, inv.id),
            );
          }
          summary.exhausted++;
        } else if (decision === 'poll') {
          await runWithTenant(inv.tenantId, () => this.transmission.refresh(inv.tenantId, inv.id));
          summary.polled++;
        } else {
          await runWithTenant(inv.tenantId, () => this.transmission.transmit(inv.tenantId, inv.id));
          summary.retried++;
        }
      } catch (err) {
        summary.failed++;
        this.logger.error(`Fallo reintentando el e-CF de la factura ${inv.id}`, err as Error);
      }
    }
    return summary;
  }
}
