import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentProviderFactory } from './payment-provider.factory';
import { StripePaymentProvider } from './providers/stripe.provider';
import { DominicanStubPaymentProvider } from './providers/dominican-stub.provider';

/**
 * Cobros (Payment) + adaptadores de pasarela enchufables por jurisdicción. `AuditModule` es global;
 * `PrismaModule` también. Exporta `PaymentsService` para que `LedgerModule` delegue el cobro. Ver D-024.
 */
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderFactory,
    StripePaymentProvider,
    DominicanStubPaymentProvider,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
