import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, LedgerEntryType, PaymentMethod, PaymentStatus } from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { PaymentProviderFactory } from './payment-provider.factory';
import { RecordPaymentDto } from './dto/record-payment.dto';
import type { RequestUser } from '../auth/auth.types';

/** Tolerancia de redondeo al comparar importes de cobro contra el saldo (céntimos). */
const EPSILON = 0.005;

/** Entrada de conciliación de un cobro (manual o, en PR-4, desde el webhook de la pasarela). */
interface ReconcileInput {
  invoiceId: string;
  amount?: string;
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
  async reconcile(user: RequestUser, input: ReconcileInput) {
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
}
