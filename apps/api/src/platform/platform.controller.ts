import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PlatformGuard } from './platform.guard';
import { PlatformService } from './platform.service';
import { ExtendTrialDto, SetSubscriptionDto } from './dto/platform.dto';

/**
 * Consola de PLATAFORMA: gestión de despachos por el super-admin (dueño). `@Public` salta el guard de
 * tenant; el acceso lo controla `PlatformGuard` (JWT con claim `platform`). Cross-tenant (BYPASSRLS).
 */
@Public()
@UseGuards(PlatformGuard)
@Controller('platform/tenants')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listTenants();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.platform.getTenant(id);
  }

  /** Extiende la prueba (p. ej. dar más días gratis). */
  @Patch(':id/trial')
  extendTrial(@Param('id') id: string, @Body() dto: ExtendTrialDto) {
    return this.platform.extendTrial(id, dto.days);
  }

  /** Activa/suspende/cancela la suscripción y fija plazas (activación manual). */
  @Patch(':id/subscription')
  setSubscription(@Param('id') id: string, @Body() dto: SetSubscriptionDto) {
    return this.platform.setSubscription(id, dto);
  }
}
