import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { GoogleService } from './google.service';
import { AttachEmailDto, SendEmailDto } from './dto/email.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Integraciones externas del despacho (Google: Calendar + Gmail). Staff. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('integrations/google')
export class IntegrationsController {
  constructor(private readonly google: GoogleService) {}

  /** ¿Configurada en el servidor? ¿Conectada por este usuario? + email de la cuenta. */
  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.google.status(user);
  }

  /** URL de consentimiento de Google (el front redirige el navegador a ella). */
  @Get('connect')
  connect(@CurrentUser() user: RequestUser) {
    return this.google.authUrl(user);
  }

  @Delete()
  disconnect(@CurrentUser() user: RequestUser) {
    return this.google.disconnect(user);
  }

  /** Empuja los plazos del despacho al Google Calendar del usuario (Lawzora → Google). */
  @Post('calendar/sync')
  syncCalendar(@CurrentUser() user: RequestUser) {
    return this.google.syncCalendar(user);
  }

  // ── Gmail: correspondencia del expediente ───────────────────────────────────
  /** Bandeja reciente, para elegir qué correo adjuntar a un expediente. */
  @Get('gmail/recent')
  recent(@CurrentUser() user: RequestUser) {
    return this.google.listRecentEmails(user);
  }

  /** Adjunta un correo de la bandeja a un expediente. */
  @Post('gmail/attach')
  attach(@CurrentUser() user: RequestUser, @Body() dto: AttachEmailDto) {
    return this.google.attachEmail(user, dto.matterId, dto.gmailId);
  }

  /** Correspondencia registrada de un expediente. */
  @Get('matters/:matterId/emails')
  matterEmails(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.google.listMatterEmails(user, matterId);
  }

  /** Envía un correo desde el Gmail del usuario y lo registra en el expediente. */
  @Post('matters/:matterId/email')
  send(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: SendEmailDto,
  ) {
    return this.google.sendEmail(user, matterId, dto.to, dto.subject, dto.body);
  }
}
