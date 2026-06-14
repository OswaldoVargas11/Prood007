import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Ajustes del despacho. Solo el administrador del despacho. */
@Roles(Role.FIRM_ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.settings.get(user);
  }

  @Patch()
  update(@CurrentUser() user: RequestUser, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(user, dto);
  }
}
