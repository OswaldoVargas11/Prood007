import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { MessagingService } from './messaging.service';
import { CreateChatMessageDto, ChatReactDto, OpenDirectDto } from './dto/messaging.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/**
 * Mensajería interna del despacho (chat social del staff): directorio, DM 1:1 y canal «General».
 * SOLO staff (FIRM_ADMIN/LAWYER); los clientes quedan fuera (no participan en la red interna).
 */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  /** Directorio de usuarios del despacho para el dock (excluye clientes). */
  @Get('directory')
  directory(@CurrentUser() user: RequestUser) {
    return this.messaging.directory(user);
  }

  /** Conversaciones del usuario (canal «General» + DMs) con último mensaje y no leídos. */
  @Get('conversations')
  conversations(@CurrentUser() user: RequestUser) {
    return this.messaging.listConversations(user);
  }

  /** Total de no leídos de mensajería interna (badge del dock). */
  @Get('unread-count')
  unread(@CurrentUser() user: RequestUser) {
    return this.messaging.unreadCount(user);
  }

  /** Abre (o reutiliza) un DM 1:1 con otro usuario del despacho. */
  @Post('direct')
  openDirect(@CurrentUser() user: RequestUser, @Body() dto: OpenDirectDto) {
    return this.messaging.openDirect(user, dto.userId);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.messaging.listMessages(user, id);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateChatMessageDto,
  ) {
    return this.messaging.createMessage(user, id, dto.body, dto.attachmentDocumentId);
  }

  /** Alterna una reacción emoji sobre un mensaje. */
  @Post('conversations/:id/messages/:messageId/react')
  react(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ChatReactDto,
  ) {
    return this.messaging.react(user, id, messageId, dto.emoji);
  }

  /** Marca la conversación como leída por el usuario actual. */
  @Post('conversations/:id/read')
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.messaging.markRead(user, id);
  }
}
