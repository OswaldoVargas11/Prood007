import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

/**
 * Facturación programada (D-028): recurrente (iguala) + planes de pago. RP2: crear/leer planes + generar
 * el cuadro de cuotas. RP3/RP4 añadirán la emisión (reutilizando `LedgerService.emitInvoiceInTx`); RP5 el
 * cron de barrido. Se exporta el servicio para que esos módulos lo reutilicen.
 */
@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
