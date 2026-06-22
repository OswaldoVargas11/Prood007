import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@legalflow/domain';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { InboundEmailService } from './inbound-email.service';
import { inboundEmailEnabled, verifyWorkerSecret } from './inbound-email.config';

@Controller('inbound-email')
export class InboundEmailController {
  constructor(private readonly service: InboundEmailService) {}

  /**
   * Webhook del worker de correo entrante. Recibe el MIME crudo (`message/rfc822`) + el destinatario de
   * sobre y el remitente por cabeceras. Ruta PÚBLICA y GATED: 404 si el conector está apagado, 403 si el
   * secreto no cuadra. El expediente sale del token de la dirección, no de un usuario.
   */
  @Public()
  @HttpCode(200)
  @Post()
  ingest(
    @Headers('x-inbound-secret') secret: string | undefined,
    @Headers('x-envelope-to') envelopeTo: string | undefined,
    @Headers('x-envelope-from') envelopeFrom: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!inboundEmailEnabled()) throw new NotFoundException();
    if (!verifyWorkerSecret(secret)) throw new ForbiddenException();
    const raw = (Buffer.isBuffer(req.body) ? req.body : req.rawBody) ?? Buffer.alloc(0);
    return this.service.ingest(raw, envelopeTo ?? '', envelopeFrom ?? '');
  }

  /** Dirección BCC de un expediente (para mostrarla en su ficha). */
  @Roles(Role.FIRM_ADMIN, Role.LAWYER)
  @Get('address/:matterId')
  address(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.addressFor(user, matterId);
  }
}
