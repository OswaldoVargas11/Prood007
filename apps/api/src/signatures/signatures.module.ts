import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { SignaturesWebhookController } from './signatures-webhook.controller';
import { SignaturesService } from './signatures.service';

@Module({
  controllers: [SignaturesController, SignaturesWebhookController],
  providers: [SignaturesService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
