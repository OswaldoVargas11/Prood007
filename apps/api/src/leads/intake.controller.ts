import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { IntakeDto } from './dto/intake.dto';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Formulario PÚBLICO de captación (intake). Sin autenticación: lo rellena un prospecto desde el enlace
 * del despacho (token). Limitado por IP para evitar abuso/spam. Crea un lead (source=intake, NEW).
 */
@Public()
@Controller('public/intake')
export class IntakeController {
  constructor(private readonly leads: LeadsService) {}

  /** Datos mínimos para pintar el formulario (nombre del despacho). 404 si el token no existe. */
  @Get(':token')
  async info(@Param('token') token: string) {
    const info = await this.leads.publicIntakeInfo(token);
    if (!info) throw new NotFoundException();
    return info;
  }

  /** Envío del formulario público. Máx. 5 envíos/minuto por IP. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':token')
  submit(@Param('token') token: string, @Body() dto: IntakeDto) {
    return this.leads.publicIntake(token, dto);
  }
}
