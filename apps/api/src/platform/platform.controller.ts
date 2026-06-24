import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PlatformGuard } from './platform.guard';
import { PlatformService, type PlatformActor } from './platform.service';
import { ExtendTrialDto, SetSubscriptionDto } from './dto/platform.dto';

/**
 * Consola de PLATAFORMA: gestión de despachos por el super-admin (dueño). `@Public` salta el guard de
 * tenant; el acceso lo controla `PlatformGuard` (JWT con claim `platform`). Cross-tenant (BYPASSRLS).
 * Toda acción se audita con el actor (email del super-admin, fijado por el guard en `req.platformAdmin`) + IP.
 */
@Public()
@UseGuards(PlatformGuard)
@Controller('platform/tenants')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  /** Deriva el actor de plataforma (email + IP) del request para la traza de auditoría (D10-002). */
  private actor(req: Request & { platformAdmin?: string }): PlatformActor {
    return { email: req.platformAdmin, ip: req.ip };
  }

  @Get()
  list(@Req() req: Request & { platformAdmin?: string }) {
    return this.platform.listTenants(this.actor(req));
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request & { platformAdmin?: string }) {
    return this.platform.getTenant(id, this.actor(req));
  }

  /** Extiende la prueba (p. ej. dar más días gratis). */
  @Patch(':id/trial')
  extendTrial(
    @Param('id') id: string,
    @Body() dto: ExtendTrialDto,
    @Req() req: Request & { platformAdmin?: string },
  ) {
    return this.platform.extendTrial(id, dto.days, this.actor(req));
  }

  /** Activa/suspende/cancela la suscripción y fija plazas (activación manual). */
  @Patch(':id/subscription')
  setSubscription(
    @Param('id') id: string,
    @Body() dto: SetSubscriptionDto,
    @Req() req: Request & { platformAdmin?: string },
  ) {
    return this.platform.setSubscription(id, dto, this.actor(req));
  }
}
