import { Injectable } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import type { BillingCycle, SeatTier } from './plans';
import {
  ANNUAL_FREE_MONTHS,
  FOUNDER_CAP,
  annualTotalFromTiers,
  cycleTotalEur,
  effectiveTiers,
  hasAppAccess,
  monthlyTotalFromTiers,
  pricePerSeatFromTiers,
  trialDaysLeft,
} from './plans';

/**
 * Suscripción de PLATAFORMA del despacho (Lawzora SaaS, modelo POR USUARIO). Estado para el banner de
 * prueba y la pantalla de suscripción. El cobro (Stripe self-service por plaza) se añade en su slice.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  /** Plazas de Fundador disponibles (cupo global). >0 ⇒ aún se puede contratar el Plan Fundador. */
  private async founderSlotsLeft(): Promise<number> {
    const taken = await this.system.tenant.count({ where: { isFounder: true } });
    return Math.max(0, FOUNDER_CAP - taken);
  }

  /** Plazas de staff ACTIVAS (letrados + admins) del despacho. */
  private async usedSeats(tenantId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: [Role.FIRM_ADMIN, Role.LAWYER] } } } },
      },
    });
  }

  /** Estado de suscripción del despacho + tabla de precios por plaza (para banner y muro). */
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
        isFounder: true,
        founderNumber: true,
        lockedSeatTiers: true,
      },
    });
    const used = await this.usedSeats(user.tenantId);
    // Plazas "de referencia" para mostrar precio: las contratadas o, en prueba, las usadas.
    const refSeats = Math.max(1, t.seats > 0 ? t.seats : used);
    // Tramos efectivos: si es fundador con tarifa bloqueada, su snapshot; si no, la tarifa pública.
    const tiers: SeatTier[] = effectiveTiers(t);
    const cycle = (t.billingCycle as BillingCycle) ?? 'MONTHLY';
    const founderSlotsLeft = await this.founderSlotsLeft();

    return {
      status: t.subscriptionStatus,
      trialEndsAt: t.trialEndsAt,
      trialDaysLeft: trialDaysLeft(t),
      currentPeriodEnd: t.currentPeriodEnd,
      hasAccess: hasAppAccess(t),
      seats: t.seats, // contratadas (0 en prueba)
      seatsUsed: used, // staff activo
      seatCap: t.maxAdmins + t.maxLawyers, // tope operativo de plazas
      billingCycle: cycle,
      isFounder: t.isFounder,
      founderNumber: t.founderNumber,
      founderSlotsLeft, // cupo de Plan Fundador que queda (0 = agotado)
      founderCap: FOUNDER_CAP,
      annualFreeMonths: ANNUAL_FREE_MONTHS,
      pricePerSeatEur: pricePerSeatFromTiers(tiers, refSeats),
      monthlyTotalEur: monthlyTotalFromTiers(tiers, t.seats),
      annualTotalEur: annualTotalFromTiers(tiers, t.seats),
      currentTotalEur: cycleTotalEur(cycle, tiers, t.seats),
      // Tabla de tramos APLICABLES (mismo producto completo; sólo cambia el precio por plaza por volumen).
      tiers: tiers.map((tier) => ({ upTo: tier.upTo, pricePerSeatEur: tier.pricePerSeatEur })),
    };
  }
}
