import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { PaymentsModule } from '../payments/payments.module';
import { DgiiModule } from '../dgii/dgii.module';
import { VerifactuModule } from '../verifactu/verifactu.module';

@Module({
  imports: [PaymentsModule, DgiiModule, VerifactuModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
