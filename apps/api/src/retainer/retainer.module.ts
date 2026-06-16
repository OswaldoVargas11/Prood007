import { Module } from '@nestjs/common';
import { RetainerService } from './retainer.service';
import { RetainerController } from './retainer.controller';
import { LedgerModule } from '../ledger/ledger.module';

/**
 * Provisión de fondos / retainer. PR-R2: motor de saldo (atómico, con `SELECT … FOR UPDATE` + guards)
 * + tipos no fiscales + lecturas. PR-R2b: emisión de factura de anticipo (reutiliza `LedgerService`
 * para `buildInvoiceRecord` + serie + ledger dentro de la misma transacción que el saldo).
 */
@Module({
  imports: [LedgerModule],
  controllers: [RetainerController],
  providers: [RetainerService],
  exports: [RetainerService],
})
export class RetainerModule {}
