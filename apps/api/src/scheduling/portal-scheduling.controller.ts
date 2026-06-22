import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { SchedulingService } from './scheduling.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

/** Auto-agenda del lado del cliente: ver abogados disponibles, franjas libres y reservar cita. */
@Roles(Role.CLIENT)
@Controller('portal/scheduling')
export class PortalSchedulingController {
  constructor(private readonly service: SchedulingService) {}

  @Get('options')
  options(@CurrentUser() user: RequestUser) {
    return this.service.clientOptions(user);
  }

  @Get('slots')
  slots(@CurrentUser() user: RequestUser, @Query('lawyerId') lawyerId: string) {
    return this.service.clientSlots(user, lawyerId);
  }

  @Get('appointments')
  appointments(@CurrentUser() user: RequestUser) {
    return this.service.listClientAppointments(user);
  }

  @Post('appointments')
  book(@CurrentUser() user: RequestUser, @Body() dto: CreateAppointmentDto) {
    return this.service.book(user, dto);
  }

  @Post('appointments/:id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.cancelClientAppointment(user, id);
  }
}
