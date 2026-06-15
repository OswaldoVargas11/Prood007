import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import type { RequestUser } from '../auth/auth.types';

/**
 * Ajustes del despacho (datos del tenant + licencia/asientos). Solo FIRM_ADMIN.
 * La licencia (plan, maxAdmins, maxLawyers) es de solo lectura aquí: la fija la suscripción.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async get(user: RequestUser) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    const [seats, clients, matters] = await Promise.all([
      this.users.seatUsage(user),
      this.prisma.client.count({ where: { tenantId: user.tenantId } }),
      this.prisma.matter.count({ where: { tenantId: user.tenantId } }),
    ]);
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        taxId: tenant.taxId,
        jurisdiction: tenant.jurisdiction,
        currency: tenant.currency,
        locale: tenant.locale,
        plan: tenant.plan,
        maxAdmins: tenant.maxAdmins,
        maxLawyers: tenant.maxLawyers,
      },
      seats,
      counts: { clients, matters },
    };
  }

  async update(user: RequestUser, dto: UpdateSettingsDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.taxId !== undefined) {
      const provider = this.compliance.forJurisdiction(user.jurisdiction);
      const result = provider.validateTaxId(dto.taxId);
      if (!result.valid) {
        throw new BadRequestException({
          message: 'Identificador fiscal del despacho no válido para la jurisdicción.',
          code: result.error?.code ?? 'INVALID_TAX_ID',
        });
      }
      data.taxId = result.normalized ?? dto.taxId;
    }
    await this.prisma.tenant.update({ where: { id: user.tenantId }, data });
    await this.audit.log(user, 'tenant.updated', 'Tenant', user.tenantId, {
      fields: Object.keys(data),
    });
    return this.get(user);
  }
}
