import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { ChatDigestService } from './chat-digest.service';

/** Resumen agregado de un barrido del resumen de chat sobre todos los tenants. */
export interface ChatDigestSweepSummary {
  tenants: number;
  evaluated: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Cron del resumen por correo de chat sin leer (NEXT 1.1). Corre cada 2 horas para captar a quien cruza la
 * ventana de silencio, pero SOLO hace trabajo si la feature global está encendida (`CHAT_DIGEST_ENABLED`):
 * mientras esté apagada (default) ni siquiera lista tenants → coste cero hasta que el owner la active.
 *
 * Sin contexto de request (igual que los crones de plazos/dunning): lista tenants con el cliente de SISTEMA
 * (BYPASSRLS) y evalúa cada uno dentro de `runWithTenant(tenantId)` para que la RLS acote las queries. Lo
 * descubre `ScheduleModule.forRoot()` de `app.module`.
 */
@Injectable()
export class ChatDigestCron {
  private readonly logger = new Logger(ChatDigestCron.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly digest: ChatDigestService,
  ) {}

  @Cron('0 */2 * * *', { name: 'chat-digest' })
  async runPeriodic(): Promise<void> {
    if (!this.digest.isEnabled()) return; // feature global apagada: nada que hacer.
    const summary = await this.sweep();
    this.logger.log(
      `Resumen de chat: ${summary.tenants} despachos, ${summary.sent} correos enviados` +
        (summary.failed ? `, ${summary.failed} fallidos` : ''),
    );
  }

  /** Recorre todos los tenants; un fallo en uno no detiene el barrido (se registra y se continúa). */
  async sweep(): Promise<ChatDigestSweepSummary> {
    const tenants = await this.system.tenant.findMany({ select: { id: true } });
    const summary: ChatDigestSweepSummary = {
      tenants: tenants.length,
      evaluated: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
    for (const t of tenants) {
      try {
        const r = await runWithTenant(t.id, () => this.digest.evaluateTenant(t.id));
        summary.evaluated += r.evaluated;
        summary.sent += r.sent;
        summary.skipped += r.skipped;
      } catch (err) {
        summary.failed++;
        this.logger.error(`Fallo al evaluar el resumen de chat del tenant ${t.id}`, err as Error);
      }
    }
    return summary;
  }
}
