import { Controller, Delete, Get, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { MicrosoftService } from './microsoft.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Conexión Microsoft 365 (OAuth) y push de agenda a Outlook Calendar. Correo: /integrations/mail. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('integrations/microsoft')
export class MicrosoftController {
  constructor(private readonly microsoft: MicrosoftService) {}

  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.microsoft.status(user);
  }

  @Get('connect')
  connect(@CurrentUser() user: RequestUser) {
    return this.microsoft.authUrl(user);
  }

  @Delete()
  disconnect(@CurrentUser() user: RequestUser) {
    return this.microsoft.disconnect(user);
  }

  /** Empuja los plazos del despacho al Outlook Calendar del usuario (Lawzora → Microsoft). */
  @Post('calendar/sync')
  syncCalendar(@CurrentUser() user: RequestUser) {
    return this.microsoft.syncCalendar(user);
  }
}
