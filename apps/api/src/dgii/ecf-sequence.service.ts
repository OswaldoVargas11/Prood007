import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { RegisterEcfSequenceDto } from './dto/ecf-sequence.dto';

/**
 * Rangos de eNCF AUTORIZADOS por la DGII (RD) por despacho. El despacho registra aquí los rangos que la
 * DGII le aprueba en la Oficina Virtual; el emisor e-CF numera desde ellos (ver `LedgerService.allocateEncf`).
 * Acotado por RLS al tenant; gestionado por el FIRM_ADMIN del despacho (autoservicio, sin la plataforma).
 */
@Injectable()
export class EcfSequenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lista los rangos del despacho con su consumo (cuántos quedan por usar). */
  async list(user: RequestUser) {
    const rows = await this.prisma.ecfSequence.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { ncfType: 'asc' },
    });
    return rows.map((r) => ({
      ncfType: r.ncfType,
      rangeStart: r.rangeStart,
      rangeEnd: r.rangeEnd,
      next: r.next,
      remaining: Math.max(0, r.rangeEnd - r.next + 1),
      expiresAt: r.expiresAt,
    }));
  }

  /** Registra/renueva un rango autorizado. Re-registrar el mismo tipo reinicia `next` al inicio del rango nuevo. */
  async register(user: RequestUser, dto: RegisterEcfSequenceDto) {
    if (dto.rangeEnd < dto.rangeStart) {
      throw new BadRequestException(apiError('dgii.encfRangeInvalid'));
    }
    const row = await this.prisma.ecfSequence.upsert({
      where: { tenantId_ncfType: { tenantId: user.tenantId, ncfType: dto.ncfType } },
      create: {
        tenantId: user.tenantId,
        ncfType: dto.ncfType,
        rangeStart: dto.rangeStart,
        rangeEnd: dto.rangeEnd,
        next: dto.rangeStart,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      update: {
        rangeStart: dto.rangeStart,
        rangeEnd: dto.rangeEnd,
        next: dto.rangeStart,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    await this.audit.log(user, 'dgii.encf_range_registered', 'EcfSequence', dto.ncfType, {
      ncfType: dto.ncfType,
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
    });
    return {
      ncfType: row.ncfType,
      rangeStart: row.rangeStart,
      rangeEnd: row.rangeEnd,
      next: row.next,
    };
  }
}
