import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { SchedulingService } from './scheduling.service';
import { UpdateSchedulingConfigDto } from './dto/update-config.dto';

/** Disponibilidad y citas del lado del despacho (cada abogado gestiona su propia agenda). */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  @Get('config')
  getConfig(@CurrentUser() user: RequestUser) {
    return this.service.getMyConfig(user);
  }

  @Put('config')
  updateConfig(@CurrentUser() user: RequestUser, @Body() dto: UpdateSchedulingConfigDto) {
    return this.service.updateMyConfig(user, dto);
  }

  @Get('appointments')
  list(@CurrentUser() user: RequestUser) {
    return this.service.listFirmAppointments(user);
  }

  @Post('appointments/:id/confirm')
  confirm(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.setStatus(user, id, 'CONFIRMED');
  }

  @Post('appointments/:id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.setStatus(user, id, 'CANCELLED');
  }
}
