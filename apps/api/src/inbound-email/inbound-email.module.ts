import { Module } from '@nestjs/common';
import { InboundEmailController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';

@Module({
  controllers: [InboundEmailController],
  providers: [InboundEmailService],
})
export class InboundEmailModule {}
