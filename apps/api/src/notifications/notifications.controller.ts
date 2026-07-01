import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('unread', new DefaultValuePipe(false), ParseBoolPipe) unread: boolean,
  ) {
    return this.notifications.listForUser(user, unread);
  }

  /** Preferencias de notificación del propio usuario (self-service, cualquier rol). */
  @Get('preferences')
  getPreferences(@CurrentUser() user: RequestUser) {
    return this.notifications.getPreferences(user);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(user, dto);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }
}
