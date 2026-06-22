import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_MIN_TIER, planHasFeature, type Feature } from '@legalflow/domain';
import { SystemPrismaService } from '../../prisma/prisma.service';
import { apiError } from '../../common/api-messages';
import { FEATURE_KEY } from '../decorators/requires-feature.decorator';
import type { RequestUser } from '../auth.types';

/**
 * Gating por TIER de suscripción. Si la ruta lleva @RequiresFeature, lee el `plan` del despacho y, si
 * el plan no incluye la función, responde 403 con la pista del tier necesario (para el upsell). Las
 * suscripciones legacy/prueba (plan no-tier) tienen acceso completo (grandfathering, ver planEffectiveTier).
 * Corre como guard global DESPUÉS de JwtAuthGuard/RolesGuard → `req.user` ya está.
 */
@Injectable()
export class EntitlementsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly system: SystemPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<Feature | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true; // ruta sin gating de función

    const { user } = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!user?.tenantId) return true; // pública / plataforma / sin autenticar

    const tenant = await this.system.tenant.findUnique({
      where: { id: user.tenantId },
      select: { plan: true },
    });
    if (planHasFeature(tenant?.plan, feature)) return true;

    throw new ForbiddenException(
      apiError('entitlement.upgradeRequired', {
        message: `Esta función requiere el plan ${FEATURE_MIN_TIER[feature]} o superior.`,
        params: { feature, requiredTier: FEATURE_MIN_TIER[feature] },
      }),
    );
  }
}
