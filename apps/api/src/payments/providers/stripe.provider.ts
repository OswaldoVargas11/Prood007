import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { Jurisdiction, PaymentMethod } from '@legalflow/domain';
import { apiError } from '../../common/api-messages';
import type {
  PaymentCheckoutParams,
  PaymentCheckoutResult,
  PaymentProvider,
} from '../payment-provider.interface';

/** Cliente Stripe (instancia) y evento de webhook, sin depender del namespace de tipos `Stripe.*`. */
type StripeClient = InstanceType<typeof Stripe>;
export type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

/** Importe decimal (string) → céntimos enteros que espera Stripe. */
function toMinorUnits(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/**
 * Provider de pago para **España** vía **Stripe Connect (Standard)**. El cobro es un cargo DIRECTO en
 * la cuenta conectada del despacho (`stripeAccount`), de modo que el dinero va al despacho, no a la
 * plataforma. Env-gated: sin `STRIPE_SECRET_KEY` el cobro online está deshabilitado y todo el módulo
 * funciona en modo manual. Ver D-024.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly jurisdiction = Jurisdiction.ES;
  readonly method = PaymentMethod.STRIPE;
  private cached?: StripeClient;

  private get stripe(): StripeClient {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new BadRequestException(apiError('payments.onlineNotConfigured'));
    if (!this.cached) this.cached = new Stripe(key);
    return this.cached;
  }

  isOnlineEnabled(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  async createCheckout(params: PaymentCheckoutParams): Promise<PaymentCheckoutResult> {
    const metadata = { invoiceId: params.invoiceId, tenantId: params.tenantId };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: params.currency.toLowerCase(),
              product_data: { name: params.description },
              unit_amount: toMinorUnits(params.amount),
            },
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata,
        payment_intent_data: { metadata },
      },
      // Cargo DIRECTO en la cuenta conectada del despacho (Connect Standard).
      { stripeAccount: params.connectedAccountId },
    );
    if (!session.url) throw new BadRequestException(apiError('payments.onlineNotConfigured'));
    return { url: session.url, providerRef: session.id };
  }

  /** Verifica la firma del webhook y devuelve el evento parseado. Lanza si la firma no es válida. */
  verifyWebhook(payload: Buffer | string, signature: string): StripeEvent {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException(apiError('payments.onlineNotConfigured'));
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /**
   * Crea (si hace falta) la cuenta conectada Standard del despacho y devuelve un Account Link para el
   * onboarding alojado por Stripe.
   */
  async createAccountLink(args: {
    accountId?: string | null;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ accountId: string; url: string }> {
    const accountId =
      args.accountId ?? (await this.stripe.accounts.create({ type: 'standard' })).id;
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: 'account_onboarding',
    });
    return { accountId, url: link.url };
  }

  /** Estado de la cuenta conectada: si puede cobrar y si completó el onboarding. */
  async accountStatus(
    accountId: string,
  ): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled: Boolean(account.charges_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
    };
  }
}
