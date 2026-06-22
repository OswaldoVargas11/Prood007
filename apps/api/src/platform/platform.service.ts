import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { SystemPrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import { planMonthlyEur, trialDaysLeft } from '../subscription/plans';
import type { SetSubscriptionDto } from './dto/platform.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gestión de despachos (tenants) por el super-admin de plataforma. CROSS-TENANT → usa SIEMPRE el rol
 * de sistema (BYPASSRLS). No expone datos de negocio de los despachos, solo metadatos de cuenta:
 * estado de suscripción, plazas, prueba y tamaño (clientes/expedientes) para la consola.
 */
@Injectable()
export class PlatformService {
  constructor(private readonly system: SystemPrismaService) {}

  private async counts(
    tenantId: string,
  ): Promise<{ seatsUsed: number; clients: number; matters: number }> {
    const [seatsUsed, clients, matters] = await Promise.all([
      this.system.user.count({
        where: {
          tenantId,
          isActive: true,
          roles: { some: { role: { code: { in: [Role.FIRM_ADMIN, Role.LAWYER] } } } },
        },
      }),
      this.system.client.count({ where: { tenantId } }),
      this.system.matter.count({ where: { tenantId } }),
    ]);
    return { seatsUsed, clients, matters };
  }

  private shape(
    t: {
      id: string;
      name: string;
      jurisdiction: string;
      currency: string;
      subscriptionStatus: string;
      seats: number;
      maxAdmins: number;
      maxLawyers: number;
      trialEndsAt: Date | null;
      currentPeriodEnd: Date | null;
      createdAt: Date;
      plan: string;
    },
    c: { seatsUsed: number; clients: number; matters: number },
  ) {
    // €/plaza/mes indicativo del plan del despacho (sin descuento por volumen). Las suscripciones
    // existentes no se reprecian; este importe es solo informativo para la consola.
    const perSeat = planMonthlyEur(t.plan);
    return {
      id: t.id,
      name: t.name,
      jurisdiction: t.jurisdiction,
      currency: t.currency,
      status: t.subscriptionStatus,
      seats: t.seats,
      seatCap: t.maxAdmins + t.maxLawyers,
      trialEndsAt: t.trialEndsAt,
      trialDaysLeft: trialDaysLeft(t),
      currentPeriodEnd: t.currentPeriodEnd,
      createdAt: t.createdAt,
      seatsUsed: c.seatsUsed,
      clients: c.clients,
      matters: c.matters,
      pricePerSeatEur: perSeat,
      monthlyTotalEur: perSeat * t.seats,
    };
  }

  private readonly SELECT = {
    id: true,
    name: true,
    jurisdiction: true,
    currency: true,
    subscriptionStatus: true,
    seats: true,
    maxAdmins: true,
    maxLawyers: true,
    trialEndsAt: true,
    currentPeriodEnd: true,
    createdAt: true,
    plan: true,
  } as const;

  /** Lista todos los despachos con metadatos de cuenta (para la consola). */
  async listTenants() {
    const tenants = await this.system.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: this.SELECT,
    });
    return Promise.all(tenants.map(async (t) => this.shape(t, await this.counts(t.id))));
  }

  private async getOrThrow(id: string) {
    const t = await this.system.tenant.findUnique({ where: { id }, select: this.SELECT });
    if (!t) throw new NotFoundException(apiError('platform.tenantNotFound'));
    return t;
  }

  async getTenant(id: string) {
    const t = await this.getOrThrow(id);
    return this.shape(t, await this.counts(id));
  }

  /** Extiende la prueba `days` días (desde hoy o desde el fin actual si aún no caducó) y la reactiva. */
  async extendTrial(id: string, days: number) {
    const t = await this.getOrThrow(id);
    const base = t.trialEndsAt && t.trialEndsAt.getTime() > Date.now() ? t.trialEndsAt : new Date();
    const trialEndsAt = new Date(base.getTime() + days * DAY_MS);
    await this.system.tenant.update({
      where: { id },
      data: { subscriptionStatus: 'TRIALING', trialEndsAt },
    });
    return this.getTenant(id);
  }

  /**
   * Fija el estado de suscripción (activar manualmente, suspender, cancelar…) y, opcionalmente, las
   * plazas contratadas. Al ACTIVAR con plazas, abre periodo de 30 días y ajusta el tope de plazas.
   */
  async setSubscription(id: string, dto: SetSubscriptionDto) {
    await this.getOrThrow(id);
    const data: Record<string, unknown> = { subscriptionStatus: dto.status };
    if (dto.seats !== undefined) {
      data.seats = dto.seats;
      // El tope operativo de plazas pasa a ser el contratado (admins dentro del total).
      data.maxLawyers = dto.seats;
      data.maxAdmins = Math.max(1, Math.min(dto.seats, 5));
    }
    if (dto.status === 'ACTIVE') {
      data.currentPeriodEnd = new Date(Date.now() + 30 * DAY_MS);
    }
    await this.system.tenant.update({ where: { id }, data });
    return this.getTenant(id);
  }
}
