import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Currency,
  FOUNDER,
  PLAN_TIERS,
  Role,
  buildPlanCatalog,
  planCurrencyForJurisdiction,
  type FxRates,
  type Jurisdiction,
} from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import {
  FOUNDER_CAP,
  hasAppAccess,
  isFounderPlan,
  resolveTier,
  trialDaysLeft,
  type BillingCycle,
} from './plans';

/**
 * Suscripción de PLATAFORMA del despacho (Lawzora SaaS). Sirve el estado del despacho + el CATÁLOGO de
 * precios (única fuente de verdad en `@legalflow/domain`) para el banner, el muro y la pantalla de planes.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly config: ConfigService,
  ) {}

  /** FX override opcional por entorno (EUR canónico). Si no hay, el catálogo usa su FX por defecto. */
  private fx(): FxRates {
    const usd = Number(this.config.get<string>('PLAN_FX_USD'));
    const dop = Number(this.config.get<string>('PLAN_FX_DOP'));
    const fx: FxRates = {};
    if (Number.isFinite(usd) && usd > 0) fx[Currency.USD] = usd;
    if (Number.isFinite(dop) && dop > 0) fx[Currency.DOP] = dop;
    return fx;
  }

  private async founderSlotsLeft(): Promise<number> {
    const taken = await this.system.tenant.count({ where: { isFounder: true } });
    return Math.max(0, FOUNDER_CAP - taken);
  }

  /** Estado público del cupo de Fundador (para la landing). Sin datos de tenant. */
  async founderStatus(): Promise<{ slotsLeft: number; cap: number }> {
    return { slotsLeft: await this.founderSlotsLeft(), cap: FOUNDER_CAP };
  }

  private async usedSeats(tenantId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: [Role.FIRM_ADMIN, Role.LAWYER] } } } },
      },
    });
  }

  /** Estado de suscripción del despacho + catálogo de precios (en su moneda de facturación). */
  async getStatus(user: RequestUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: {
        subscriptionStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        seats: true,
        maxAdmins: true,
        maxLawyers: true,
        billingCycle: true,
        cancelAtPeriodEnd: true,
        isFounder: true,
        founderNumber: true,
        plan: true,
        jurisdiction: true,
        currency: true,
      },
    });
    const used = await this.usedSeats(user.tenantId);
    const founderSlotsLeft = await this.founderSlotsLeft();

    // Moneda de facturación del SaaS: por jurisdicción (ES→EUR, RD→USD); el catálogo se da en esa moneda.
    const currency = planCurrencyForJurisdiction(t.jurisdiction as Jurisdiction);
    const catalog = buildPlanCatalog(this.fx(), [currency]);

    return {
      status: t.subscriptionStatus,
      trialEndsAt: t.trialEndsAt,
      trialDaysLeft: trialDaysLeft(t),
      currentPeriodEnd: t.currentPeriodEnd,
      cancelAtPeriodEnd: t.cancelAtPeriodEnd,
      hasAccess: hasAppAccess(t),
      seats: t.seats,
      seatsUsed: used,
      seatCap: t.maxAdmins + t.maxLawyers,
      billingCycle: (t.billingCycle as BillingCycle) ?? 'MONTHLY',
      // Plan actual del despacho: tier conocido o 'FOUNDER'; informativo para la UI.
      plan: isFounderPlan(t.plan) ? 'FOUNDER' : resolveTier(t.plan),
      isFounder: t.isFounder,
      founderNumber: t.founderNumber,
      founderSlotsLeft,
      founderCap: FOUNDER_CAP,
      founderMonthlyEur: FOUNDER.monthlyEur,
      founderCycles: FOUNDER.cycles,
      currency,
      // Catálogo NUEVO (altas nuevas). Las suscripciones existentes no se reprecian (grandfathering).
      tiers: PLAN_TIERS,
      catalog,
    };
  }
}
