import { Injectable } from '@nestjs/common';
import { Jurisdiction } from '@legalflow/domain';
import type { PaymentProvider } from './payment-provider.interface';
import { StripePaymentProvider } from './providers/stripe.provider';
import { DominicanStubPaymentProvider } from './providers/dominican-stub.provider';

/**
 * Selecciona el `PaymentProvider` por la jurisdicción del tenant (mismo patrón que
 * `ComplianceProviderFactory`). ES → Stripe; DO → stub (Azul/CardNet diferido). Nada de país
 * hardcodeado fuera de aquí. Ver D-024.
 */
@Injectable()
export class PaymentProviderFactory {
  constructor(
    private readonly stripe: StripePaymentProvider,
    private readonly dominican: DominicanStubPaymentProvider,
  ) {}

  get(jurisdiction: Jurisdiction): PaymentProvider {
    return jurisdiction === Jurisdiction.DO ? this.dominican : this.stripe;
  }
}
