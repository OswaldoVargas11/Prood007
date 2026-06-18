import { Injectable } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import { SEAT_TIERS, hasAppAccess, monthlyTotalEur, pricePerSeatEur, trialDaysLeft } from './plans';

/**
 * Suscripción de PLATAFORMA del despacho (Lawzora SaaS, modelo POR USUARIO). Estado para el banner de
 * prueba y la pantalla de suscripción. El cobro (Stripe self-service por plaza) se añade en su slice.
 */
@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

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
      },
    });
    const used = await this.usedSeats(user.tenantId);
    // Plazas "de referencia" para mostrar precio: las contratadas o, en prueba, las usadas.
    const refSeats = t.seats > 0 ? t.seats : used;

    return {
      status: t.subscriptionStatus,
      trialEndsAt: t.trialEndsAt,
      trialDaysLeft: trialDaysLeft(t),
      currentPeriodEnd: t.currentPeriodEnd,
      hasAccess: hasAppAccess(t),
      seats: t.seats, // contratadas (0 en prueba)
      seatsUsed: used, // staff activo
      seatCap: t.maxAdmins + t.maxLawyers, // tope operativo de plazas
      pricePerSeatEur: pricePerSeatEur(Math.max(1, refSeats)),
      monthlyTotalEur: monthlyTotalEur(t.seats),
      // Tabla de tramos (mismo producto completo; sólo cambia el precio por plaza por volumen).
      tiers: SEAT_TIERS.map((tier) => ({ upTo: tier.upTo, pricePerSeatEur: tier.pricePerSeatEur })),
    };
  }
}
