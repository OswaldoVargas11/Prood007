import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, LedgerEntryType, PaymentMethod, PaymentStatus } from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant, tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { PaymentProviderFactory } from './payment-provider.factory';
import { StripePaymentProvider } from './providers/stripe.provider';
import { RecordPaymentDto } from './dto/record-payment.dto';
import type { RequestUser } from '../auth/auth.types';

/** Tolerancia de redondeo al comparar importes de cobro contra el saldo (céntimos). */
const EPSILON = 0.005;

/** URL pública del web (para las URLs de retorno de Stripe). */
function publicBaseUrl(): string {
  return process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';
}

/** Actor de un cobro: usuario autenticado o sistema (webhook). Solo necesita el tenant. */
type PaymentActor = { tenantId: string; userId?: string };

/** Entrada de conciliación de un cobro (manual o desde el webhook de la pasarela). */
interface ReconcileInput {
  invoiceId: string;
  amount?: string;
  /** Moneda del cobro (de la pasarela). Si se indica, debe coincidir con la de la factura. */
  currency?: string;
  method: PaymentMethod;
  status?: PaymentStatus;
  providerRef?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cobros sobre facturas. Soporta cobros PARCIALES (varios `Payment` por factura) y deja el modelo de
 * datos listo para conciliar con pasarela (Stripe en ES) vía webhook en PR-4. La conciliación es
 * AGNÓSTICA de pasarela; el adaptador concreto solo cubre el checkout online. Ver D-024.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providers: PaymentProviderFactory,
    private readonly stripe: StripePaymentProvider,
  ) {}

  /** Estado del cobro online para la jurisdicción del tenant (lo consume la UI). */
  paymentConfig(user: RequestUser) {
    const provider = this.providers.get(user.jurisdiction);
    return {
      jurisdiction: provider.jurisdiction,
      method: provider.method,
      onlineEnabled: provider.isOnlineEnabled(),
    };
  }

  /** Registra un cobro MANUAL (lo introduce el despacho). Soporta importe parcial. */
  recordManualPayment(user: RequestUser, dto: RecordPaymentDto) {
    return this.reconcile(user, {
      invoiceId: dto.invoiceId,
      amount: dto.amount,
      method: PaymentMethod.MANUAL,
      status: PaymentStatus.SUCCEEDED,
      note: dto.note,
    });
  }

  /**
   * Núcleo de conciliación: crea el `Payment` y, si quedó SUCCEEDED, mueve `amountPaid` de la factura,
   * recalcula su estado (PARTIAL/PAID) y refleja el cobro en el ledger. Idempotente por `providerRef`
   * (un webhook reintentado no duplica el cobro).
   */
  async reconcile(user: PaymentActor, input: ReconcileInput) {
    if (input.providerRef) {
      const existing = await this.prisma.payment.findFirst({
        where: { tenantId: user.tenantId, providerRef: input.providerRef },
      });
      if (existing) return { payment: existing, deduped: true };
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: user.tenantId },
      select: {
        id: true,
        number: true,
        matterId: true,
        currency: true,
        status: true,
        total: true,
        amountPaid: true,
      },
    });
    if (!invoice) throw new NotFoundException(apiError('payments.invoiceNotFound'));
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException(apiError('payments.invoiceNotPayable'));
    }
    // La moneda del evento de la pasarela debe coincidir con la de la factura (no conciliar USD vs EUR).
    if (input.currency && input.currency.toUpperCase() !== invoice.currency) {
      throw new BadRequestException(apiError('payments.currencyMismatch'));
    }

    const total = Number(invoice.total);
    const alreadyPaid = Number(invoice.amountPaid);
    const outstanding = round2(total - alreadyPaid);
    if (outstanding <= 0) throw new BadRequestException(apiError('payments.alreadyPaid'));

    const amount = input.amount != null ? round2(Number(input.amount)) : outstanding;
    if (!(amount > 0)) throw new BadRequestException(apiError('payments.amountPositive'));
    if (amount > outstanding + EPSILON) {
      throw new BadRequestException(apiError('payments.amountExceedsOutstanding'));
    }

    const status = input.status ?? PaymentStatus.SUCCEEDED;
    const succeeded = status === PaymentStatus.SUCCEEDED;
    const now = new Date();

    const payment = await tenantTransaction(this.prisma, async (tx) => {
      const created = await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          invoiceId: invoice.id,
          amount: amount.toFixed(2),
          currency: invoice.currency,
          status,
          method: input.method,
          providerRef: input.providerRef,
          note: input.note,
          metadata: input.metadata as object | undefined,
          paidAt: succeeded ? now : null,
        },
      });

      if (succeeded) {
        const newPaid = round2(alreadyPaid + amount);
        const fullyPaid = newPaid + EPSILON >= total;
        await tx.invoice.updateMany({
          where: { id: invoice.id, tenantId: user.tenantId },
          data: {
            amountPaid: newPaid.toFixed(2),
            status: fullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
            paidAt: fullyPaid ? now : null,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            tenantId: user.tenantId,
            matterId: invoice.matterId,
            type: LedgerEntryType.PAYMENT,
            description: `Cobro factura ${invoice.number}`,
            amount: amount.toFixed(2),
            currency: invoice.currency,
            invoiceId: invoice.id,
          },
        });
      }
      return created;
    });

    await this.audit.log(user, 'invoice.payment_recorded', 'Payment', payment.id, {
      invoiceId: invoice.id,
      amount: amount.toFixed(2),
      method: input.method,
      status,
    });
    return { payment, deduped: false };
  }

  /** Lista los cobros de una factura (acotado al tenant por RLS). */
  async listByInvoice(user: RequestUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException(apiError('payments.invoiceNotFound'));
    return this.prisma.payment.findMany({
      where: { tenantId: user.tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Cobro online (Stripe Connect) ─────────────────────────────────────────
  /**
   * Crea una sesión de pago online para el saldo pendiente de la factura y devuelve el enlace de cobro.
   * El cargo va a la cuenta conectada del despacho (Connect Standard). No crea `Payment` aún: el cobro
   * se concilia cuando llega el webhook `checkout.session.completed`.
   */
  async createCheckout(user: RequestUser, invoiceId: string) {
    const provider = this.providers.get(user.jurisdiction);
    if (!provider.isOnlineEnabled()) {
      throw new BadRequestException(apiError('payments.onlineNotConfigured'));
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: user.tenantId },
      select: {
        id: true,
        number: true,
        currency: true,
        status: true,
        total: true,
        amountPaid: true,
        tenant: { select: { stripeAccountId: true } },
      },
    });
    if (!invoice) throw new NotFoundException(apiError('payments.invoiceNotFound'));
    if (!invoice.tenant.stripeAccountId) {
      throw new BadRequestException(apiError('payments.stripeNotConnected'));
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException(apiError('payments.invoiceNotPayable'));
    }
    const outstanding = round2(Number(invoice.total) - Number(invoice.amountPaid));
    if (outstanding <= 0) throw new BadRequestException(apiError('payments.alreadyPaid'));

    const base = publicBaseUrl();
    const result = await provider.createCheckout({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      tenantId: user.tenantId,
      connectedAccountId: invoice.tenant.stripeAccountId,
      amount: outstanding.toFixed(2),
      currency: invoice.currency,
      description: `Factura ${invoice.number}`,
      successUrl: `${base}/invoices/${invoice.id}?paid=1`,
      cancelUrl: `${base}/invoices/${invoice.id}`,
    });
    await this.audit.log(user, 'invoice.checkout_created', 'Invoice', invoice.id, {
      providerRef: result.providerRef,
    });
    return { url: result.url };
  }

  /**
   * Procesa un webhook de Stripe. Verifica la firma, y ante `checkout.session.completed` concilia el
   * cobro bajo el contexto de tenant que viaja en los metadatos del evento (la ruta es pública: el
   * tenant NO sale de un usuario autenticado, sino del evento verificado). Idempotente por `providerRef`.
   */
  async handleStripeWebhook(payload: Buffer | string, signature: string) {
    const event = this.stripe.verifyWebhook(payload, signature);
    if (event.type !== 'checkout.session.completed') return { received: true };

    // Solo se usan estos campos del objeto sesión; tipado estructural para no depender del namespace.
    const session = event.data.object as {
      id: string;
      currency?: string | null;
      metadata?: Record<string, string> | null;
      amount_total?: number | null;
      payment_intent?: string | { id: string } | null;
    };
    const tenantId = session.metadata?.tenantId;
    const invoiceId = session.metadata?.invoiceId;
    if (!tenantId || !invoiceId || session.amount_total == null) return { received: true };

    const amount = (session.amount_total / 100).toFixed(2);
    const providerRef =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? session.id);

    await runWithTenant(tenantId, async () => {
      try {
        await this.reconcile(
          { tenantId },
          {
            invoiceId,
            amount,
            currency: session.currency ?? undefined,
            method: PaymentMethod.STRIPE,
            status: PaymentStatus.SUCCEEDED,
            providerRef,
            metadata: { stripeSessionId: session.id, stripeEventId: event.id },
          },
        );
      } catch (err) {
        // Conflictos de negocio (ya pagada, etc.) no deben provocar reintentos de Stripe: se ignoran.
        if (!(err instanceof BadRequestException)) throw err;
      }
    });
    return { received: true };
  }

  // ── Onboarding de la cuenta conectada (Stripe Connect Standard) ────────────
  /** Crea/recupera la cuenta conectada del despacho y devuelve el enlace de onboarding de Stripe. */
  async connectOnboard(user: RequestUser) {
    if (!this.stripe.isOnlineEnabled()) {
      throw new BadRequestException(apiError('payments.onlineNotConfigured'));
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { stripeAccountId: true },
    });
    const base = publicBaseUrl();
    const { accountId, url } = await this.stripe.createAccountLink({
      accountId: tenant.stripeAccountId,
      refreshUrl: `${base}/settings?stripe=refresh`,
      returnUrl: `${base}/settings?stripe=connected`,
    });
    if (accountId !== tenant.stripeAccountId) {
      await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: { stripeAccountId: accountId },
      });
      await this.audit.log(user, 'stripe.account_connected', 'Tenant', user.tenantId);
    }
    return { url };
  }

  /** Estado de la conexión Stripe del despacho (para Ajustes). */
  async connectStatus(user: RequestUser) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { stripeAccountId: true },
    });
    if (!this.stripe.isOnlineEnabled() || !tenant.stripeAccountId) {
      return { connected: false, onlineEnabled: this.stripe.isOnlineEnabled() };
    }
    const status = await this.stripe.accountStatus(tenant.stripeAccountId);
    return {
      connected: status.chargesEnabled,
      onlineEnabled: true,
      detailsSubmitted: status.detailsSubmitted,
      accountId: tenant.stripeAccountId,
    };
  }
}
