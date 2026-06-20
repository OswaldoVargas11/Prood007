import { Controller, Get } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { CalendarService } from './calendar.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Enlace de suscripción a la agenda (iCal). Cualquier staff genera/obtiene el suyo. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** Devuelve el token del feed iCal del usuario. El front construye la URL `…/api/public/calendar/:token`. */
  @Get('feed-link')
  async feedLink(@CurrentUser() user: RequestUser) {
    return { token: await this.calendar.feedToken(user.userId) };
  }
}
