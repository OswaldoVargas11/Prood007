import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { STORAGE_PROVIDER } from '@legalflow/domain';
import type { StorageProvider } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AddHolidayDto } from './dto/add-holiday.dto';
import type { RequestUser } from '../auth/auth.types';

interface Holiday {
  date: string;
  name: string;
}

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Ajustes del despacho: datos del tenant, licencia (solo lectura), serie fiscal, festivos locales y
 * certificado digital. Solo FIRM_ADMIN.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private holidaysOf(raw: unknown): Holiday[] {
    if (!Array.isArray(raw)) return [];
    return (raw as Holiday[])
      .filter((h) => h && typeof h.date === 'string' && typeof h.name === 'string')
      .sort((a, b) => a.date.localeCompare(b.date));
  }

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
        invoiceSeries: tenant.invoiceSeries,
      },
      seats,
      counts: { clients, matters },
      holidays: this.holidaysOf(tenant.holidays),
      certificate: tenant.certificateName
        ? { name: tenant.certificateName, uploadedAt: tenant.certificateUploadedAt }
        : null,
    };
  }

  async update(user: RequestUser, dto: UpdateSettingsDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.invoiceSeries !== undefined) data.invoiceSeries = dto.invoiceSeries.toUpperCase();
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

  async addHoliday(user: RequestUser, dto: AddHolidayDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    const holidays = this.holidaysOf(tenant.holidays);
    if (holidays.some((h) => h.date === dto.date)) {
      throw new BadRequestException('Ya existe un festivo en esa fecha.');
    }
    holidays.push({ date: dto.date, name: dto.name.trim() });
    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { holidays: holidays as unknown as object },
    });
    await this.audit.log(user, 'holiday.added', 'Tenant', user.tenantId, { date: dto.date });
    return this.get(user);
  }

  async removeHoliday(user: RequestUser, date: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    const holidays = this.holidaysOf(tenant.holidays).filter((h) => h.date !== date);
    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { holidays: holidays as unknown as object },
    });
    await this.audit.log(user, 'holiday.removed', 'Tenant', user.tenantId, { date });
    return this.get(user);
  }

  async uploadCertificate(user: RequestUser, file?: UploadedFile) {
    if (!file) throw new BadRequestException('Falta el archivo del certificado.');
    const key = `${user.tenantId}/certificate/${file.originalname}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        certificateName: file.originalname,
        certificateKey: key,
        certificateUploadedAt: new Date(),
      },
    });
    await this.audit.log(user, 'certificate.uploaded', 'Tenant', user.tenantId, {
      name: file.originalname,
    });
    return this.get(user);
  }
}
