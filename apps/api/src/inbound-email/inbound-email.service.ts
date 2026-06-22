import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { InboundEmailDto } from './dto/inbound-email.dto';
import {
  inboundEmailEnabled,
  matterBccAddress,
  parseMatterAddress,
  verifyMatterToken,
} from './inbound-email.config';
import { extractEmailBody } from './mime';

/**
 * Email-por-BCC al expediente: el webhook recibe el correo parseado, resuelve el expediente por la
 * dirección+token (cross-tenant, sin contexto de usuario) y lo archiva como MatterEmail entrante. El
 * binding se autentica con el token del expediente; la inserción usa el cliente del sistema (BYPASSRLS)
 * con tenantId explícito.
 */
@Injectable()
export class InboundEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  async ingest(dto: InboundEmailDto) {
    const parsed = parseMatterAddress(dto.to);
    if (!parsed || !verifyMatterToken(parsed.matterId, parsed.token)) {
      throw new ForbiddenException('invalid recipient token');
    }
    const matter = await this.system.matter.findUnique({
      where: { id: parsed.matterId },
      select: { id: true, tenantId: true },
    });
    if (!matter) throw new NotFoundException('matter not found');

    // El worker reenvía el MIME crudo en `text`; extraemos el cuerpo legible para el extracto.
    const body = extractEmailBody(dto.text ?? '');
    await this.system.matterEmail.create({
      data: {
        tenantId: matter.tenantId,
        matterId: matter.id,
        direction: 'IN',
        fromAddr: dto.from.slice(0, 320),
        toAddr: dto.to.slice(0, 320),
        subject: dto.subject?.slice(0, 500) ?? null,
        snippet: body.slice(0, 300) || null,
        sentAt: new Date(),
      },
    });
    return { archived: true };
  }

  /** Dirección BCC del expediente (para mostrarla en la UI). Solo si el conector está activo. */
  async addressFor(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notFound'));
    const enabled = inboundEmailEnabled();
    return { enabled, address: enabled ? matterBccAddress(matterId) : null };
  }
}
