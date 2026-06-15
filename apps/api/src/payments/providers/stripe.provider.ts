import { BadRequestException, Injectable } from '@nestjs/common';
import { Jurisdiction, PaymentMethod } from '@legalflow/domain';
import { apiError } from '../../common/api-messages';
import type {
  PaymentCheckoutParams,
  PaymentCheckoutResult,
  PaymentProvider,
} from '../payment-provider.interface';

/**
 * Provider de pago para **España** (Stripe Connect). En esta PR es un ESQUELETO: la integración real
 * (sesión de Checkout + webhook idempotente) se cablea en PR-4. `isOnlineEnabled()` refleja si hay
 * credenciales de Stripe configuradas; mientras no las haya, el cobro online no está disponible y el
 * despacho usa el registro manual. Ver D-024.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly jurisdiction = Jurisdiction.ES;
  readonly method = PaymentMethod.STRIPE;

  isOnlineEnabled(): boolean {
    // PR-4 añadirá la verificación real de la cuenta conectada; por ahora basta la clave de plataforma.
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  async createCheckout(_params: PaymentCheckoutParams): Promise<PaymentCheckoutResult> {
    // La creación real de la sesión de Checkout llega en PR-4 (Stripe Connect + webhook).
    throw new BadRequestException(apiError('payments.onlineNotConfigured'));
  }
}
