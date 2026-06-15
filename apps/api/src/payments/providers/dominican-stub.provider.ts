import { BadRequestException, Injectable } from '@nestjs/common';
import { Jurisdiction, PaymentMethod } from '@legalflow/domain';
import { apiError } from '../../common/api-messages';
import type {
  PaymentCheckoutParams,
  PaymentCheckoutResult,
  PaymentProvider,
} from '../payment-provider.interface';

/**
 * Provider de pago para **República Dominicana**. STUB documentado: Stripe no opera para negocios
 * dominicanos y los adquirentes locales (Azul, CardNet) requieren credenciales de comercio que aún no
 * tenemos. El cobro online no está disponible; el despacho usa el registro manual. Cuando haya merchant
 * Azul/CardNet, se implementa aquí sin tocar el núcleo. Ver D-024.
 */
@Injectable()
export class DominicanStubPaymentProvider implements PaymentProvider {
  readonly jurisdiction = Jurisdiction.DO;
  readonly method = PaymentMethod.MANUAL;

  isOnlineEnabled(): boolean {
    return false;
  }

  async createCheckout(_params: PaymentCheckoutParams): Promise<PaymentCheckoutResult> {
    throw new BadRequestException(apiError('payments.onlineNotConfigured'));
  }
}
