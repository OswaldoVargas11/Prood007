import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/**
 * Cuota diaria de IA POR TENANT. Las llamadas al modelo (Anthropic/Voyage) tienen coste real contra una
 * clave compartida; sin tope, un usuario staff (o una cuenta comprometida) podría dispararlas en bucle y
 * agotar el presupuesto / chocar con los rate-limits del proveedor para todos. El `@Throttle` del
 * controlador acota la RÁFAGA por IP; esta cuota acota el VOLUMEN total por despacho y día.
 *
 * Contador persistido (tabla `AiUsage`, RLS por tenant) con incremento atómico vía upsert. Tope por
 * `AI_DAILY_CALL_LIMIT` (default 200/día). Las rutas de sistema (cron de indexado) NO consumen cuota.
 */
@Injectable()
export class AiQuotaService {
  private readonly limit: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('AI_DAILY_CALL_LIMIT'));
    this.limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200;
  }

  /** Reserva una unidad de cuota del día para el tenant; lanza 429 si se supera el tope diario. */
  async consume(user: RequestUser): Promise<void> {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const row = await this.prisma.aiUsage.upsert({
      where: { tenantId_day: { tenantId: user.tenantId, day } },
      create: { tenantId: user.tenantId, day, calls: 1 },
      update: { calls: { increment: 1 } },
    });
    if (row.calls > this.limit) {
      throw new HttpException(
        apiError('ai.dailyQuotaExceeded', {
          message: `Has alcanzado el límite diario de IA (${this.limit} consultas). Inténtalo mañana o amplía el plan.`,
          params: { limit: this.limit },
        }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
