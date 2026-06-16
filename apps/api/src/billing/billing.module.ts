import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

/**
 * Facturación programada (D-028): recurrente (iguala) + planes de pago. RP2: crear/leer planes + generar
 * el cuadro de cuotas. RP3: emisión recurrente (1 factura/periodo) reutilizando `LedgerService.emitInvoiceInTx`
 * (de ahí el import de `LedgerModule`). RP4: emisión de planes de pago; RP5: cron de barrido. Se exporta el
 * servicio para que esos módulos lo reutilicen.
 */
@Module({
  imports: [LedgerModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
