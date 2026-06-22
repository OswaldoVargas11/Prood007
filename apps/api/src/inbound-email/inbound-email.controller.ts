import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { InboundEmailService } from './inbound-email.service';
import { InboundEmailDto } from './dto/inbound-email.dto';
import { inboundEmailEnabled, verifyWorkerSecret } from './inbound-email.config';

@Controller('inbound-email')
export class InboundEmailController {
  constructor(private readonly service: InboundEmailService) {}

  /**
   * Webhook del worker de correo entrante. Ruta PÚBLICA y GATED: 404 si el conector está apagado, 403 si
   * el secreto del worker no cuadra. El expediente sale del token de la dirección, no de un usuario.
   */
  @Public()
  @HttpCode(200)
  @Post()
  ingest(@Headers('x-inbound-secret') secret: string | undefined, @Body() dto: InboundEmailDto) {
    if (!inboundEmailEnabled()) throw new NotFoundException();
    if (!verifyWorkerSecret(secret)) throw new ForbiddenException();
    return this.service.ingest(dto);
  }

  /** Dirección BCC de un expediente (para mostrarla en su ficha). */
  @Roles(Role.FIRM_ADMIN, Role.LAWYER)
  @Get('address/:matterId')
  address(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.addressFor(user, matterId);
  }
}
