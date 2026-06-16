import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { RetainerModule } from '../retainer/retainer.module';
import { PaymentsModule } from '../payments/payments.module';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';

@Module({
  imports: [LedgerModule, RetainerModule, PaymentsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
