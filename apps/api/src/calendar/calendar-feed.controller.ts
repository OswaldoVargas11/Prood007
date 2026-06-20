import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Feed PÚBLICO de agenda en iCal (.ics). Lo consume el calendario del despacho (Google/Outlook/Apple)
 * suscribiéndose a la URL secreta. Sin auth: el token firmado de la URL hace de credencial.
 */
@Public()
@Controller('public/calendar')
export class CalendarFeedController {
  constructor(private readonly calendar: CalendarService) {}

  @Get(':token')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  async feed(@Param('token') token: string): Promise<string> {
    const ics = await this.calendar.feed(token.replace(/\.ics$/, ''));
    if (ics === null) throw new NotFoundException();
    return ics;
  }
}
