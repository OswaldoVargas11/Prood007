import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import type { SubscriptionStatus } from './plans';

/** Cliente Stripe y tipos derivados de la instancia, sin depender del namespace `Stripe.*` (D-024). */
type StripeClient = InstanceType<typeof Stripe>;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

/** Forma mínima de una suscripción de Stripe que usamos (evita el namespace de tipos estricto). */
interface SubLike {
  id: string;
  status: string;
  current_period_end: number;
  items: { data: Array<{ quantity?: number | null }> };
  metadata?: Record<string, string> | null;
}

/** Traduce el estado de Stripe al estado interno del tenant. */
function mapStatus(s: string): SubscriptionStatus {
  switch (s) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'PAST_DUE';
    case 'paused':
      return 'SUSPENDED';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED';
    default:
      return 'PAST_DUE';
  }
}

/**
 * Cobro SELF-SERVICE de la suscripción de plataforma (Lawzora cobra al despacho). Distinto del módulo
 * `payments` (Stripe Connect, donde el despacho cobra a SUS clientes). Usa el Stripe de la PLATAFORMA
 * directamente: Checkout (cantidad = plazas, precio escalonado por volumen), portal y webhook.
 */
@Injectable()
export class StripeBillingService {
  private readonly stripe: StripeClient | null;
  private readonly priceId?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
    this.priceId = config.get<string>('STRIPE_PRICE_SEAT');
  }

  isEnabled(): boolean {
    return Boolean(this.stripe && this.priceId);
  }

  private client(): StripeClient {
    if (!this.stripe || !this.priceId) {
      throw new BadRequestException(apiError('subscription.stripeNotConfigured'));
    }
    return this.stripe;
  }

  private baseUrl(): string {
    return this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:3000';
  }

  /** Crea (o reutiliza) el customer del despacho en el Stripe de la plataforma. */
  private async ensureCustomer(user: RequestUser): Promise<string> {
    const stripe = this.client();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { id: true, name: true, stripeCustomerId: true },
    });
    if (tenant.stripeCustomerId) return tenant.stripeCustomerId;
    const me = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { email: true },
    });
    const customer = await stripe.customers.create({
      name: tenant.name,
      email: me?.email ?? undefined,
      metadata: { tenantId: tenant.id },
    });
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  /** Sesión de Checkout para suscribirse a `seats` plazas (precio escalonado por volumen). */
  async createCheckout(user: RequestUser, seats: number): Promise<{ url: string }> {
    const stripe = this.client();
    const customer = await this.ensureCustomer(user);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: this.priceId!, quantity: seats }],
      success_url: `${this.baseUrl()}/subscription?status=success`,
      cancel_url: `${this.baseUrl()}/subscription?status=cancel`,
      subscription_data: { metadata: { tenantId: user.tenantId } },
      metadata: { tenantId: user.tenantId },
      allow_promotion_codes: true,
    });
    if (!session.url) throw new BadRequestException(apiError('subscription.checkoutFailed'));
    return { url: session.url };
  }

  /** Sesión del portal de cliente de Stripe (gestionar/cancelar la suscripción). */
  async createPortal(user: RequestUser): Promise<{ url: string }> {
    const stripe = this.client();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { stripeCustomerId: true },
    });
    if (!tenant.stripeCustomerId)
      throw new BadRequestException(apiError('subscription.noCustomer'));
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${this.baseUrl()}/subscription`,
    });
    return { url: session.url };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  private verify(rawBody: Buffer, signature: string): StripeEvent {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!this.stripe || !secret) {
      throw new BadRequestException(apiError('subscription.webhookInvalid'));
    }
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException(apiError('subscription.webhookInvalid'));
    }
  }

  /** Aplica al tenant el estado/plazas/periodo de una suscripción de Stripe (cross-tenant, BYPASSRLS). */
  private async applySubscription(tenantId: string, sub: SubLike): Promise<void> {
    const seats = sub.items.data[0]?.quantity ?? 0;
    await this.system.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionStatus: mapStatus(sub.status),
        seats,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        stripeSubscriptionId: sub.id,
        // El tope operativo de plazas pasa a ser el contratado.
        maxLawyers: seats,
        maxAdmins: Math.max(1, Math.min(seats, 5)),
      },
    });
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    const stripe = this.client();
    const event = this.verify(rawBody, signature);
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          metadata?: Record<string, string> | null;
          subscription?: string | { id: string } | null;
        };
        const tenantId = session.metadata?.tenantId;
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (tenantId && subId) {
          const sub = (await stripe.subscriptions.retrieve(subId)) as unknown as SubLike;
          await this.applySubscription(tenantId, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as unknown as SubLike;
        const tenantId = sub.metadata?.tenantId;
        if (tenantId) await this.applySubscription(tenantId, sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as unknown as SubLike;
        const tenantId = sub.metadata?.tenantId;
        if (tenantId) {
          await this.system.tenant.update({
            where: { id: tenantId },
            data: { subscriptionStatus: 'CANCELED' },
          });
        }
        break;
      }
      default:
        break;
    }
    return { received: true };
  }
}
