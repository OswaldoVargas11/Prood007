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

  /**
   * Registra/renueva un rango autorizado por la DGII.
   *
   * H-2 (CWE-840): el contador `next` NUNCA retrocede. Antes, re-registrar el mismo tipo reiniciaba
   * `next` al inicio del rango, lo que podía reemitir eNCF ya consumidos — el `@@unique([tenantId,
   * number])` lo cortaría con P2002, pero eso rompe la emisión y pierde la posición. Ahora:
   *  - Renovar con un rango NUEVO (rangeStart > posición consumida) arranca `next` en el inicio nuevo.
   *  - Re-registrar un rango que SOLAPA la porción ya consumida conserva `next` (= max(actual, inicio)),
   *    de modo que jamás se reutiliza un número ya emitido.
   */
  async register(user: RequestUser, dto: RegisterEcfSequenceDto) {
    if (dto.rangeEnd < dto.rangeStart) {
      throw new BadRequestException(apiError('dgii.encfRangeInvalid'));
    }
    const existing = await this.prisma.ecfSequence.findUnique({
      where: { tenantId_ncfType: { tenantId: user.tenantId, ncfType: dto.ncfType } },
    });
    // `next` resultante: nunca por debajo de lo ya consumido. Si el rango nuevo empieza por encima del
    // contador actual (renovación limpia), arranca ahí; si solapa lo consumido, mantiene el contador.
    const nextStart = existing ? Math.max(existing.next, dto.rangeStart) : dto.rangeStart;
    // Un rango nuevo cuyo fin queda por debajo de lo ya consumido no aporta números utilizables: lo
    // rechazamos para que el despacho registre un rango válido (no es un reinicio silencioso).
    if (nextStart > dto.rangeEnd) {
      throw new BadRequestException(
        apiError('dgii.encfRangeExhausted', { params: { ncfType: dto.ncfType } }),
      );
    }
    const row = await this.prisma.ecfSequence.upsert({
      where: { tenantId_ncfType: { tenantId: user.tenantId, ncfType: dto.ncfType } },
      create: {
        tenantId: user.tenantId,
        ncfType: dto.ncfType,
        rangeStart: dto.rangeStart,
        rangeEnd: dto.rangeEnd,
        next: nextStart,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      update: {
        rangeStart: dto.rangeStart,
        rangeEnd: dto.rangeEnd,
        next: nextStart,
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
