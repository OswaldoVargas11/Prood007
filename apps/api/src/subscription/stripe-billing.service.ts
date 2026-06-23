import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Currency,
  FOUNDER,
  Role,
  planCurrencyForJurisdiction,
  type Jurisdiction,
  type SubscriptionTierId,
} from '@legalflow/domain';
import Stripe from 'stripe';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import type { BillingCycle, SubscriptionStatus } from './plans';
import { FOUNDER_CAP } from './plans';
import { loadPriceMap, resolvePriceId, type PlanKey } from './stripe-prices';

/** Opciones de contratación: plazas, tier, ciclo y si solicita Plan Fundador. */
export interface CheckoutOptions {
  seats: number;
  tier: SubscriptionTierId;
  cycle: BillingCycle;
  founder: boolean;
}

/** Cliente Stripe y tipos derivados de la instancia, sin depender del namespace `Stripe.*` (D-024). */
type StripeClient = InstanceType<typeof Stripe>;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

/**
 * Forma mínima de una suscripción de Stripe que usamos (evita el namespace de tipos estricto). OJO:
 * desde la API basil (2025) y en dahlia (2026), `current_period_end` se movió de la suscripción a
 * CADA ITEM. Lo declaramos en ambos sitios y leemos primero el del item (D-…): si solo miráramos el
 * nivel superior vendría `undefined` y `new Date(NaN)` abortaría la activación al pagar.
 */
interface SubLike {
  id: string;
  status: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  items: { data: Array<{ quantity?: number | null; current_period_end?: number }> };
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
  /** Mapa de Price IDs del esquema nuevo (clave tier|FOUNDER:ciclo:moneda → price_…). */
  private readonly priceMap: Record<string, string>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
    this.priceMap = loadPriceMap(config);
  }

  isEnabled(): boolean {
    return Boolean(this.stripe && Object.keys(this.priceMap).length > 0);
  }

  private client(): StripeClient {
    if (!this.stripe || Object.keys(this.priceMap).length === 0) {
      throw new BadRequestException(apiError('subscription.stripeNotConfigured'));
    }
    return this.stripe;
  }

  /** Price ID de Stripe para (plan, ciclo, moneda) del esquema nuevo; exige el mapa configurado. */
  private priceFor(plan: PlanKey, cycle: BillingCycle, currency: Currency): string {
    const id = resolvePriceId(this.priceMap, plan, cycle, currency);
    if (!id) throw new BadRequestException(apiError('subscription.priceNotConfigured'));
    return id;
  }

  private baseUrl(): string {
    return this.config.get<string>('APP_PUBLIC_URL') ?? 'https://lawzora.com';
  }

  /**
   * ¿El customer guardado sigue existiendo (y no está borrado) en Stripe? `retrieve` de un cliente
   * borrado NO lanza: devuelve un objeto con `deleted: true`; uno inexistente lanza `resource_missing`.
   * Tratamos ambos como "no existe" para poder recrearlo. Cualquier otro error se propaga.
   */
  private async customerExists(stripe: StripeClient, customerId: string): Promise<boolean> {
    try {
      const c = await stripe.customers.retrieve(customerId);
      return !(c as { deleted?: boolean }).deleted;
    } catch (e) {
      if ((e as { code?: string }).code === 'resource_missing') return false;
      throw e;
    }
  }

  /**
   * Crea (o reutiliza) el customer del despacho en el Stripe de la plataforma. Si el `cus_…` guardado
   * ya no existe en Stripe (p. ej. tras pasar de test→live, o si se borró desde el panel), lo RECREA
   * en lugar de fallar — así el botón "Suscribirme" nunca queda roto por un id huérfano.
   */
  private async ensureCustomer(user: RequestUser): Promise<string> {
    const stripe = this.client();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { id: true, name: true, stripeCustomerId: true },
    });
    if (tenant.stripeCustomerId && (await this.customerExists(stripe, tenant.stripeCustomerId))) {
      return tenant.stripeCustomerId;
    }
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

  /** ¿Quedan plazas de Plan Fundador en el cupo global? */
  private async founderSlotsLeft(): Promise<number> {
    const taken = await this.system.tenant.count({ where: { isFounder: true } });
    return Math.max(0, FOUNDER_CAP - taken);
  }

  /** Moneda de facturación del SaaS para el despacho (ES→EUR, RD→USD). */
  private async billingCurrency(tenantId: string): Promise<Currency> {
    const t = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { jurisdiction: true },
    });
    return planCurrencyForJurisdiction(t.jurisdiction as Jurisdiction);
  }

  /**
   * Sesión de Checkout para suscribirse a `seats` plazas de un TIER y CICLO concretos. Si solicita
   * Fundador (solo prepago anual/bienal) y hay cupo, se cobra el price de Fundador y se marca la
   * intención en la metadata; el alta efectiva del beneficio se hace al aplicar la suscripción.
   */
  async createCheckout(user: RequestUser, opts: CheckoutOptions): Promise<{ url: string }> {
    const stripe = this.client();
    const currency = await this.billingCurrency(user.tenantId);
    // Sólo concedemos la intención Fundador si aún hay cupo en el momento del checkout.
    const wantsFounder = opts.founder && (await this.founderSlotsLeft()) > 0;
    // El Fundador exige prepago anual o bienal (nunca mensual).
    if (wantsFounder && !FOUNDER.cycles.includes(opts.cycle)) {
      throw new BadRequestException(apiError('subscription.founderCycleInvalid'));
    }
    const plan: PlanKey = wantsFounder ? 'FOUNDER' : opts.tier;
    const price = this.priceFor(plan, opts.cycle, currency);
    const customer = await this.ensureCustomer(user);
    const metadata: Record<string, string> = {
      tenantId: user.tenantId,
      plan,
      tier: opts.tier,
      cycle: opts.cycle,
      founder: wantsFounder ? 'true' : 'false',
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: opts.seats }],
      success_url: `${this.baseUrl()}/subscription?status=success`,
      cancel_url: `${this.baseUrl()}/subscription?status=cancel`,
      subscription_data: { metadata },
      metadata,
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
      select: { id: true, stripeCustomerId: true },
    });
    // Sólo abrimos el portal si el customer guardado existe de verdad en Stripe. Si quedó huérfano
    // (test→live, borrado manual), limpiamos el id y pedimos que se suscriba primero.
    if (tenant.stripeCustomerId && (await this.customerExists(stripe, tenant.stripeCustomerId))) {
      const session = await stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: `${this.baseUrl()}/subscription`,
      });
      return { url: session.url };
    }
    if (tenant.stripeCustomerId) {
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: null },
      });
    }
    throw new BadRequestException(apiError('subscription.noCustomer'));
  }

  /**
   * Cambia el número de plazas (quantity) de la suscripción. PRORRATEO con COBRO ANTICIPADO:
   * `always_invoice` emite y cobra YA una factura por el importe proporcional de los días que faltan
   * hasta la próxima fecha de cobro (al añadir) o aplica un crédito proporcional (al quitar). El cambio
   * aplica al instante (la plaza queda disponible ya) y, en la fecha normal de facturación, se cobra
   * todo junto. No se permite bajar por debajo del staff activo (nadie debe quedarse sin licencia).
   */
  async changeSeats(user: RequestUser, newSeats: number): Promise<{ seats: number }> {
    const stripe = this.client();
    if (!Number.isInteger(newSeats) || newSeats < 1) {
      throw new BadRequestException(apiError('subscription.seatsInvalid'));
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { id: true, stripeSubscriptionId: true },
    });
    if (!tenant.stripeSubscriptionId) {
      throw new BadRequestException(apiError('subscription.noSubscription'));
    }
    const used = await this.prisma.user.count({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: [Role.FIRM_ADMIN, Role.LAWYER] } } } },
      },
    });
    if (newSeats < used) {
      throw new BadRequestException(
        apiError('subscription.seatsBelowUsage', {
          message: `No puedes bajar de ${used} plazas: tienes ${used} usuarios activos.`,
          params: { used },
        }),
      );
    }

    const sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new BadRequestException(apiError('subscription.noSubscription'));
    const updated = await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
      items: [{ id: itemId, quantity: newSeats }],
      // Cobro anticipado: factura el prorrateo al momento (no en la próxima factura).
      proration_behavior: 'always_invoice',
    });
    // Sincroniza el tenant ya (sin esperar al webhook) para que la UI refleje las plazas al momento.
    await this.applySubscription(user.tenantId, updated as unknown as SubLike);
    return { seats: newSeats };
  }

  /**
   * Cancela la suscripción AL FINAL DEL PERIODO. La suscripción sigue ACTIVE y el despacho conserva el
   * acceso hasta `currentPeriodEnd`; Stripe no vuelve a cobrar y al expirar emite
   * `customer.subscription.deleted` → CANCELED. Es reversible con `resume()` mientras no haya expirado.
   * Sincroniza el flag al instante (sin esperar al webhook) para que la UI muestre "se cancelará el …".
   */
  async cancel(user: RequestUser): Promise<{ cancelAtPeriodEnd: true }> {
    const stripe = this.client();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { stripeSubscriptionId: true },
    });
    if (!tenant.stripeSubscriptionId) {
      throw new BadRequestException(apiError('subscription.noSubscription'));
    }
    const updated = await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await this.applySubscription(user.tenantId, updated as unknown as SubLike);
    return { cancelAtPeriodEnd: true };
  }

  /** Deshace una cancelación programada: reanuda la suscripción (vuelve a cobrar en la fecha normal). */
  async resume(user: RequestUser): Promise<{ cancelAtPeriodEnd: false }> {
    const stripe = this.client();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { stripeSubscriptionId: true },
    });
    if (!tenant.stripeSubscriptionId) {
      throw new BadRequestException(apiError('subscription.noSubscription'));
    }
    const updated = await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await this.applySubscription(user.tenantId, updated as unknown as SubLike);
    return { cancelAtPeriodEnd: false };
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
    const item = sub.items.data[0];
    const seats = item?.quantity ?? 0;
    const cycle: BillingCycle =
      sub.metadata?.cycle === 'ANNUAL' || sub.metadata?.cycle === 'BIENNIAL'
        ? (sub.metadata.cycle as BillingCycle)
        : 'MONTHLY';
    const isFounderSub = sub.metadata?.founder === 'true';
    // Plan elegido (tier o FOUNDER). Solo se fija al crear/cambiar quantity NO lo toca (preserva el plan).
    const plan = isFounderSub ? 'FOUNDER' : (sub.metadata?.tier ?? sub.metadata?.plan);
    // Fin de periodo: en API basil/dahlia vive en el item; fallback al nivel superior (versiones viejas).
    const periodEndUnix = item?.current_period_end ?? sub.current_period_end;

    const data: Record<string, unknown> = {
      subscriptionStatus: mapStatus(sub.status),
      seats,
      billingCycle: cycle,
      stripeSubscriptionId: sub.id,
      // Baja agendada: Stripe la marca en la suscripción; la reflejamos para el aviso "se cancelará el …".
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      // El tope operativo de plazas pasa a ser el contratado.
      maxLawyers: seats,
      maxAdmins: Math.max(1, Math.min(seats, 5)),
    };
    if (typeof plan === 'string' && plan) data.plan = plan;
    // Solo guardamos la fecha si Stripe la dio y es válida: `new Date(NaN)` rompería TODO el update y
    // el despacho quedaría sin activar pese a haber pagado. ACTIVE no depende de esta fecha (hasAppAccess).
    if (typeof periodEndUnix === 'number' && Number.isFinite(periodEndUnix)) {
      data.currentPeriodEnd = new Date(periodEndUnix * 1000);
    }

    // Plan Fundador: alta efectiva del beneficio si lo pidió, no lo era ya, y queda cupo. La tarifa queda
    // CONGELADA de por vida por estar en el Price de Fundador (inmutable; no se migra). Sin snapshot de
    // volumen (el descuento por volumen se eliminó).
    //
    // El cupo (FOUNDER_CAP) es GLOBAL, no por tenant: el conteo + la asignación de `founderNumber` deben
    // serializarse o dos webhooks Fundador concurrentes leen el mismo `taken` y ambos confirman como #18
    // (cupo superado + founderNumber duplicado). Se hace todo en UNA transacción del cliente de sistema
    // (BYPASSRLS, requiere conteo cross-tenant) con un lock de aviso GLOBAL (espacio 3, clave 0; los
    // espacios 1=plazas y 2=facturas son por tenant). El índice único en founderNumber es la red final.
    if (isFounderSub) {
      await this.system.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(3, 0)`;
        const fresh = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { isFounder: true },
        });
        if (!fresh?.isFounder) {
          const taken = await tx.tenant.count({ where: { isFounder: true } });
          if (taken < FOUNDER_CAP) {
            data.isFounder = true;
            data.founderNumber = taken + 1;
          }
        }
        await tx.tenant.update({ where: { id: tenantId }, data });
      });
      return;
    }

    await this.system.tenant.update({ where: { id: tenantId }, data });
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
            // Ya expiró y se canceló de verdad: limpiamos la baja agendada (deja de tener sentido).
            data: { subscriptionStatus: 'CANCELED', cancelAtPeriodEnd: false },
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
