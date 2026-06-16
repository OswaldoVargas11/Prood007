import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { RetainerModule } from '../retainer/retainer.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

/**
 * Facturación programada (D-028): recurrente (iguala) + planes de pago. RP2: crear/leer + cuadro de cuotas.
 * RP3: emisión recurrente (1 factura/periodo, reusa `LedgerService.emitInvoiceInTx`). RP4a: plan de pago de
 * servicio prestado (1 factura). RP4b: plan de pago por anticipos — cada cuota cobrada emite su factura de
 * anticipo reutilizando `RetainerService.depositAnticipo` (de ahí el import de `RetainerModule`). RP5: cron.
 */
@Module({
  imports: [LedgerModule, RetainerModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
