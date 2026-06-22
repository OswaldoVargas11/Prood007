import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { JudicialNotificationsService } from './judicial-notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ChainDeadlineDto } from './dto/chain-deadline.dto';

/** Bandeja de notificaciones judiciales (LexNET-lite) y conector LexNET gated. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('judicial-notifications')
export class JudicialNotificationsController {
  constructor(private readonly service: JudicialNotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('matterId') matterId?: string,
    @Query('pending') pending?: string,
  ) {
    return this.service.list(user, { matterId, pending: pending === 'true' });
  }

  @Get('connector')
  connector() {
    return this.service.connectorStatus();
  }

  @Post('sync')
  sync() {
    return this.service.sync();
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateNotificationDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/deadline')
  chain(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ChainDeadlineDto) {
    return this.service.chainDeadline(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
