import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { PaymentsModule } from '../payments/payments.module';
import { DgiiModule } from '../dgii/dgii.module';

@Module({
  imports: [PaymentsModule, DgiiModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
