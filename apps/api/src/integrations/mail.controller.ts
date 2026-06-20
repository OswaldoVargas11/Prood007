import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { MailService } from './mail.service';
import { AttachEmailDto, SendEmailDto } from './dto/email.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Correo del expediente, neutral de proveedor (despacha a Google o Microsoft, el que esté conectado). */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('integrations/mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  /** Proveedor de correo conectado por este usuario ('google' | 'microsoft' | null). */
  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.mail.status(user);
  }

  /** Bandeja reciente del proveedor conectado, para elegir qué adjuntar. */
  @Get('recent')
  recent(@CurrentUser() user: RequestUser) {
    return this.mail.listRecent(user);
  }

  /** Adjunta un correo de la bandeja a un expediente. */
  @Post('attach')
  attach(@CurrentUser() user: RequestUser, @Body() dto: AttachEmailDto) {
    return this.mail.attach(user, dto.matterId, dto.externalId);
  }

  /** Correspondencia registrada de un expediente (ambos proveedores). */
  @Get('matters/:matterId')
  matterEmails(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.mail.listForMatter(user, matterId);
  }

  /** Envía un correo desde la cuenta conectada y lo registra en el expediente. */
  @Post('matters/:matterId/send')
  send(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: SendEmailDto,
  ) {
    return this.mail.send(user, matterId, dto.to, dto.subject, dto.body);
  }
}
