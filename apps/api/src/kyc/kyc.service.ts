import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertKycDto } from './dto/upsert-kyc.dto';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/**
 * KYC/AML (prevención de blanqueo). Un perfil 1:1 por cliente con estado de diligencia, nivel de
 * riesgo, marca PEP y verificaciones. SIEMPRE acotado por tenant (filtro `tenantId` + RLS).
 */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertClientInTenant(user: RequestUser, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!client) throw new BadRequestException(apiError('clients.notFound'));
  }

  /** Perfil KYC de un cliente (o null si aún no se ha iniciado la diligencia). */
  async getForClient(user: RequestUser, clientId: string) {
    await this.assertClientInTenant(user, clientId);
    // Scoping explícito por tenant (además del assert + RLS): no fiarse solo del pre-check por si se
    // reordena en el futuro — se trata de datos AML (PEP, sanciones, riesgo).
    return this.prisma.kycProfile.findFirst({ where: { clientId, tenantId: user.tenantId } });
  }

  /** Crea o actualiza el perfil KYC del cliente. Sella revisor/fecha en cada cambio. */
  async upsert(user: RequestUser, clientId: string, dto: UpsertKycDto) {
    await this.assertClientInTenant(user, clientId);
    const now = new Date();
    const data = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.risk !== undefined ? { risk: dto.risk } : {}),
      ...(dto.isPep !== undefined ? { isPep: dto.isPep } : {}),
      ...(dto.identityVerified !== undefined ? { identityVerified: dto.identityVerified } : {}),
      ...(dto.sanctionsChecked !== undefined ? { sanctionsChecked: dto.sanctionsChecked } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      reviewedById: user.userId,
      reviewedAt: now,
    };
    const profile = await this.prisma.kycProfile.upsert({
      where: { clientId },
      create: { tenantId: user.tenantId, clientId, ...data },
      update: data,
    });
    await this.audit.log(user, 'kyc.updated', 'KycProfile', profile.id, {
      status: profile.status,
      risk: profile.risk,
    });
    return profile;
  }

  /** Listado de clientes con su estado KYC (panel AML del despacho). */
  async overview(user: RequestUser) {
    const clients = await this.prisma.client.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        taxId: true,
        kyc: {
          select: { status: true, risk: true, isPep: true, reviewedAt: true },
        },
      },
    });
    return clients.map((c) => ({
      clientId: c.id,
      name: c.name,
      taxId: c.taxId,
      status: c.kyc?.status ?? 'PENDING',
      risk: c.kyc?.risk ?? null,
      isPep: c.kyc?.isPep ?? false,
      reviewedAt: c.kyc?.reviewedAt ?? null,
    }));
  }

  /** Resumen agregado para el panel: conteos por estado + riesgo alto + PEP. */
  async summary(user: RequestUser) {
    const overview = await this.overview(user);
    const byStatus: Record<string, number> = {
      PENDING: 0,
      IN_REVIEW: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    let highRisk = 0;
    let pep = 0;
    for (const c of overview) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      if (c.risk === 'HIGH') highRisk++;
      if (c.isPep) pep++;
    }
    return { total: overview.length, byStatus, highRisk, pep };
  }
}
