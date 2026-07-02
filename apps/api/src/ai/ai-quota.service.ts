import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { AI_MODEL_LIGHT_DEFAULT } from './ai-model-routing';
import type { RequestUser } from '../auth/auth.types';

/**
 * Cuota diaria de IA POR TENANT. Las llamadas al modelo (Anthropic/Voyage) tienen coste real contra una
 * clave compartida; sin tope, un usuario staff (o una cuenta comprometida) podría dispararlas en bucle y
 * agotar el presupuesto / chocar con los rate-limits del proveedor para todos. El `@Throttle` del
 * controlador acota la RÁFAGA por IP; esta cuota acota el VOLUMEN total por despacho y día.
 *
 * Doble tope (tabla `AiUsage`, RLS por tenant, incremento atómico vía upsert):
 *  - `AI_DAILY_CALL_LIMIT` (default 200/día) → nº de llamadas.
 *  - `AI_DAILY_TOKEN_LIMIT` (default 2.000.000/día) → COSTE real (tokens). El tope por llamadas no basta:
 *    un `summarizeDocument` con un adjunto de 8 MB cuesta órdenes de magnitud más que un `ask` (D5-001).
 *    `recordUsage` suma los tokens reales devueltos por el motor; `consume` pre-comprueba el presupuesto
 *    de tokens del día ANTES de la llamada cara. El agotamiento de cuota emite un evento de auditoría
 *    `ai.quota_exhausted` (señal de denial-of-wallet, D10-005). Las rutas de sistema (cron) NO consumen.
 */
@Injectable()
export class AiQuotaService {
  private readonly limit: number;
  private readonly tokenLimit: number;
  private readonly lightModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('AI_DAILY_CALL_LIMIT'));
    this.limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200;
    const rawTokens = Number(config.get<string>('AI_DAILY_TOKEN_LIMIT'));
    this.tokenLimit =
      Number.isFinite(rawTokens) && rawTokens > 0 ? Math.floor(rawTokens) : 2_000_000;
    this.lightModel = config.get<string>('AI_MODEL_LIGHT') || AI_MODEL_LIGHT_DEFAULT;
  }

  /**
   * Reserva una unidad de cuota del día para el tenant y pre-comprueba el presupuesto de tokens.
   * Lanza 429 si se supera el tope de llamadas o si los tokens ya consumidos hoy superan el tope diario.
   */
  async consume(user: RequestUser): Promise<void> {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const row = await this.prisma.aiUsage.upsert({
      where: { tenantId_day: { tenantId: user.tenantId, day } },
      create: { tenantId: user.tenantId, day, calls: 1 },
      update: { calls: { increment: 1 } },
    });
    if (row.calls > this.limit) {
      await this.flagExhausted(user, day, 'calls', { calls: row.calls, limit: this.limit });
      throw new HttpException(
        apiError('ai.dailyQuotaExceeded', {
          message: `Has alcanzado el límite diario de IA (${this.limit} consultas). Inténtalo mañana o amplía el plan.`,
          params: { limit: this.limit },
        }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (row.inputTokens + row.outputTokens >= this.tokenLimit) {
      await this.flagExhausted(user, day, 'tokens', {
        tokens: row.inputTokens + row.outputTokens,
        limit: this.tokenLimit,
      });
      throw new HttpException(
        apiError('ai.dailyQuotaExceeded', {
          message: `Has alcanzado el presupuesto diario de IA. Inténtalo mañana o amplía el plan.`,
          params: { limit: this.tokenLimit },
        }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Contabiliza los tokens reales consumidos por una llamada (se llama tras responder el motor). Si
   * `model` coincide con el modelo LIGERO configurado (`AI_MODEL_LIGHT`), además desglosa esos tokens en
   * `lightModel*` para poder medir el ahorro de coste por tenant.
   */
  async recordUsage(
    user: RequestUser,
    inputTokens: number,
    outputTokens: number,
    model?: string,
  ): Promise<void> {
    if (!inputTokens && !outputTokens) return;
    const day = new Date().toISOString().slice(0, 10);
    const isLight = model === this.lightModel;
    await this.prisma.aiUsage.upsert({
      where: { tenantId_day: { tenantId: user.tenantId, day } },
      create: {
        tenantId: user.tenantId,
        day,
        calls: 0,
        inputTokens,
        outputTokens,
        ...(isLight
          ? { lightModelInputTokens: inputTokens, lightModelOutputTokens: outputTokens }
          : {}),
      },
      update: {
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        ...(isLight
          ? {
              lightModelInputTokens: { increment: inputTokens },
              lightModelOutputTokens: { increment: outputTokens },
            }
          : {}),
      },
    });
  }

  private async flagExhausted(
    user: RequestUser,
    day: string,
    reason: 'calls' | 'tokens',
    meta: Record<string, number>,
  ): Promise<void> {
    await this.audit
      .log(user, 'ai.quota_exhausted', 'AiUsage', day, { reason, ...meta })
      .catch(() => undefined);
  }
}
