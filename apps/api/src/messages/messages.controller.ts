import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto, ReactDto } from './dto/create-message.dto';
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
    return this.messages.create(user, matterId, dto.body, dto.attachmentDocumentId);
  }

  /** Alterna una reacción emoji del usuario sobre un mensaje. */
  @Post(':messageId/react')
  react(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactDto,
  ) {
    return this.messages.react(user, matterId, messageId, dto.emoji);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.messages.list(user, matterId);
  }

  /** Acuses de lectura del expediente (quién ha leído hasta cuándo). */
  @Get('reads')
  reads(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.messages.reads(user, matterId);
  }

  /** Marca el chat como leído por el usuario actual. */
  @Post('read')
  markRead(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.messages.markRead(user, matterId);
  }
}

/** Bandeja de conversaciones (firm-wide) y recuento de no leídos. */
@Controller('messages')
export class MessagesInboxController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  conversations(@CurrentUser() user: RequestUser) {
    return this.messages.listConversations(user);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: RequestUser) {
    return this.messages.unreadCount(user);
  }
}
