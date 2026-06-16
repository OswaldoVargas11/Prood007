import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { RetainerService } from '../retainer/retainer.service';
import { PaymentsService } from '../payments/payments.service';
import { assertMatterAccess } from '../messages/matter-access';
import { apiError } from '../common/api-messages';
import { buildInvoicePdf, invoiceRowToPdfData } from '../ledger/invoice-pdf';
import { deriveOverdue, startOfTodayUtc } from '../ledger/overdue.util';
import type { InvoiceStatus } from '@legalflow/domain';
import type { RequestUser } from '../auth/auth.types';

/**
 * Portal del cliente (solo lectura). Cada endpoint queda acotado a los expedientes de la propia
 * ficha de cliente del usuario, vía `assertMatterAccess` y el vínculo Client.userId.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly retainer: RetainerService,
    private readonly payments: PaymentsService,
  ) {}

  private async myClient(user: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
    });
    if (!client) throw new ForbiddenException(apiError('portal.noClientProfile'));
    return client;
  }

  async myProfile(user: RequestUser) {
    const client = await this.myClient(user);
    return { id: client.id, name: client.name, taxId: client.taxId, email: client.email };
  }

  async listMatters(user: RequestUser) {
    const client = await this.myClient(user);
    return this.prisma.matter.findMany({
      where: { tenantId: user.tenantId, clientId: client.id },
      orderBy: { openedAt: 'desc' },
    });
  }

  async getMatter(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.prisma.matter.findFirst({ where: { id: matterId, tenantId: user.tenantId } });
  }

  async listDocuments(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.prisma.document.findMany({
      where: { tenantId: user.tenantId, matterId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, reviewStatus: true, createdAt: true },
        },
      },
    });
  }

  async ledgerView(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    const ledger = await this.ledger.getMatterLedger(user, matterId);
    // El cliente NUNCA ve costes propuestos/rechazados (procesos internos del despacho): solo aprobados.
    return {
      ...ledger,
      entries: ledger.entries.filter((e) => e.approvalStatus === 'APPROVED'),
    };
  }

  /**
   * Saldo de provisión de fondos del expediente (solo lectura), acotado al expediente propio del
   * cliente vía `assertMatterAccess`. Reutiliza `RetainerService.getMatterAccount` (misma fuente que el
   * despacho): saldo + movimientos. El cliente ve sus propios fondos; no puede operar (sin acciones).
   */
  async retainerView(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.retainer.getMatterAccount(user, matterId);
  }

  async listTasks(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.prisma.task.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async listInvoices(user: RequestUser) {
    const client = await this.myClient(user);
    const rows = await this.prisma.invoice.findMany({
      where: { tenantId: user.tenantId, clientId: client.id },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        currency: true,
        total: true,
        taxableBase: true,
        taxAmount: true,
        withholdingAmount: true,
      },
    });
    // `overdue` derivado en lectura (misma regla que el despacho): el cliente ve el recordatorio de
    // pago sin depender del scheduler de dunning. Ver ledger/overdue.util.
    const today = startOfTodayUtc();
    return rows.map((r) => ({
      ...r,
      overdue: deriveOverdue(r.status as InvoiceStatus, r.dueDate, today),
    }));
  }

  /**
   * PDF de una factura DEL PROPIO cliente (control de propiedad por `clientId`). 404 si no es suya.
   * Reutiliza el mismo builder que el despacho — el documento es idéntico.
   */
  async invoicePdf(user: RequestUser, id: string): Promise<{ buffer: Buffer; number: string }> {
    const client = await this.myClient(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId, clientId: client.id },
      include: {
        lines: true,
        client: { select: { name: true, taxId: true } },
        tenant: { select: { name: true, taxId: true } },
      },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    const buffer = await buildInvoicePdf(invoiceRowToPdfData(invoice, user.jurisdiction));
    return { buffer, number: invoice.number };
  }

  // ── Cobro online por el cliente ───────────────────────────────────────────
  /** ¿Puede el cliente pagar online? (pasarela del despacho configurada + cuenta conectada). */
  paymentConfig(user: RequestUser) {
    return this.payments.canPayOnline(user).then((onlineEnabled) => ({ onlineEnabled }));
  }

  /**
   * El CLIENTE paga SU PROPIA factura: genera el enlace de Stripe Checkout. El cargo va a la cuenta
   * conectada del despacho. Control de propiedad por `clientId` (404 si la factura no es suya). El
   * cliente vuelve a su portal tras pagar; el webhook concilia la factura a PAID.
   */
  async payInvoice(user: RequestUser, id: string) {
    const client = await this.myClient(user);
    const owned = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId, clientId: client.id },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    const base = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';
    return this.payments.createCheckout(user, id, {
      successUrl: `${base}/portal?paid=1`,
      cancelUrl: `${base}/portal`,
    });
  }
}
