import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController, MessagesInboxController } from './messages.controller';

@Module({
  controllers: [MessagesController, MessagesInboxController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
