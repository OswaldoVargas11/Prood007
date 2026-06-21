import { Controller, Delete, Get, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { GoogleService } from './google.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Conexión Google (OAuth) y push de agenda. El correo va por el controlador neutral /integrations/mail. */
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

  /** Config para abrir el Google Picker (clientId/apiKey/appId) + si el usuario ya concedió Drive. */
  @Get('drive/config')
  driveConfig(@CurrentUser() user: RequestUser) {
    return this.google.driveConfig(user);
  }
}
