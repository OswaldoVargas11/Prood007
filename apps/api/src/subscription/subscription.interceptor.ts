import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { SystemPrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { ALLOW_EXPIRED_KEY } from './allow-expired.decorator';
import { hasAppAccess } from './plans';

/**
 * MURO DE SUSCRIPCIÓN. Corre como interceptor (después de los guards → `req.user` ya está) y bloquea
 * el acceso a la app cuando la prueba caducó sin suscripción (o el estado no da acceso), salvo en las
 * rutas marcadas `@AllowExpired` (estado de suscripción, checkout/portal, sesión). Responde 402.
 *
 * Lectura ligera del tenant por petición (cacheable a futuro). Rutas públicas/plataforma no llevan
 * `req.user.tenantId` → no se tocan.
 */
@Injectable()
export class SubscriptionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly system: SystemPrismaService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const tenantId = req.user?.tenantId;
    if (!tenantId) return next.handle(); // pública / plataforma / sin autenticar

    const allowExpired = this.reflector.getAllAndOverride<boolean>(ALLOW_EXPIRED_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (allowExpired) return next.handle();

    const tenant = await this.system.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });
    if (tenant && !hasAppAccess(tenant)) {
      // 402 Payment Required: la UI lo intercepta y muestra el muro de suscripción.
      throw new HttpException(apiError('subscription.required'), HttpStatus.PAYMENT_REQUIRED);
    }
    return next.handle();
  }
}
