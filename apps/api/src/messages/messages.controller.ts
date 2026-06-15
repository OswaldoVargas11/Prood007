import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Controller('matters/:matterId/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messages.create(user, matterId, dto.body);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.messages.list(user, matterId);
  }
}
