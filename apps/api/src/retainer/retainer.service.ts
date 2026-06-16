import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Jurisdiction,
  InvoiceDocumentType,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  PaymentStatus,
  ProvisionKind,
  RectificationMode,
  RetainerMovementType,
} from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { apiError } from '../common/api-messages';
import { DEFAULT_PAYMENT_TERM_DAYS, addDaysUtc } from '../ledger/overdue.util';
import { RecordDepositDto } from './dto/record-deposit.dto';
import { RecordAnticipoDto } from './dto/record-anticipo.dto';
import { ApplyRetainerDto } from './dto/apply-retainer.dto';
import { FinalInvoiceDto } from './dto/final-invoice.dto';
import { RefundAnticipoDto } from './dto/refund-anticipo.dto';
import type { RequestUser } from '../auth/auth.types';

/** Tolerancia de redondeo al comparar saldos (céntimos). */
const EPSILON = 0.005;

/** Un movimiento a aplicar sobre la cuenta (importe CON signo). Reutilizable por R3 (APPLICATION/REFUND). */
interface MovementInput {
  type: RetainerMovementType;
  kind?: ProvisionKind | null;
  amount: string; // con signo (DEPOSIT +, APPLICATION/REFUND −)
  invoiceId?: string | null;
  paymentId?: string | null;
  note?: string | null;
}

/**
 * Provisión de fondos / retainer (saldo por expediente). Motor de saldo atómico (`SELECT … FOR UPDATE`
 * + guards + invariante `balance == Σ(entries)`). `deposit` cubre los tipos NO fiscales (SUPLIDO,
 * GENERICO) y RECHAZA ANTICIPO; el ANTICIPO va por `depositAnticipo` (R2b), que emite su factura de
 * anticipo: un anticipo nunca se registra como saldo sin su factura.
 */
@Injectable()
export class RetainerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  private async getMatterOrThrow(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      include: {
        tenant: { select: { name: true, taxId: true, currency: true } },
        client: { select: { id: true, name: true, taxId: true } },
      },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
    return matter;
  }

  /** Cobro de provisión (depósito) manual. SUPLIDO/GENERICO; ANTICIPO bloqueado (ver R2b). */
  async deposit(user: RequestUser, dto: RecordDepositDto) {
    if (dto.kind === ProvisionKind.ANTICIPO) {
      // Bloqueo deliberado: el anticipo de honorarios devenga al cobro y EXIGE factura (D-026). No se
      // permite registrarlo como simple saldo (sería no conforme). Se habilita en PR-R2b.
      throw new BadRequestException(apiError('retainer.anticipoRequiresInvoice'));
    }
    const amount = Number(dto.amount);
    if (!(amount > 0)) throw new BadRequestException(apiError('retainer.amountPositive'));

    const matter = await this.getMatterOrThrow(user, dto.matterId);
    const tenantCurrency = matter.tenant.currency;
    if (dto.currency && dto.currency !== tenantCurrency) {
      throw new BadRequestException(apiError('retainer.currencyMismatch'));
    }

    // La cuenta se asegura FUERA de la transacción del movimiento (operaciones autocommit): así un
    // primer depósito concurrente del mismo expediente no choca con una fila aún sin confirmar. La
    // transacción del movimiento ya solo bloquea (FOR UPDATE) una cuenta que existe y está confirmada.
    const account = await this.ensureAccount(user.tenantId, matter.id, tenantCurrency);
    const result = await tenantTransaction(this.prisma, async (tx) =>
      this.postMovement(tx, user.tenantId, account.id, {
        type: RetainerMovementType.DEPOSIT,
        kind: dto.kind,
        amount: amount.toFixed(2),
        note: dto.note,
      }),
    );

    await this.audit.log(user, 'retainer.deposit', 'RetainerAccount', result.accountId, {
      matterId: matter.id,
      amount: amount.toFixed(2),
      kind: dto.kind,
    });
    return result;
  }

  /**
   * Cobro de provisión de tipo ANTICIPO de honorarios (R2b). Bajo el default conforme (D-026), devenga
   * IVA/ITBIS al cobro y EXIGE factura: emite la FACTURA DE ANTICIPO y acredita el retainer por el TOTAL
   * recibido, TODO ATÓMICO en una transacción — serie fiscal + registro Verifactu/e-CF (reutiliza
   * `buildInvoiceRecord` vía `LedgerService.emitInvoiceInTx`, sin atajos) + factura PAID + Payment +
   * apuntes de ledger (INVOICE + PAYMENT) + `RetainerEntry DEPOSIT(ANTICIPO)` + saldo. Un fallo parcial
   * revierte limpio, incluida la serie. La factura final deducirá el anticipo (R3).
   *
   * `amount` = BASE imponible (honorarios). IVA 21% (ES) / ITBIS 18% (RD) por el `taxCode` de la
   * jurisdicción; IRPF si el cliente es retenedor (`withholdingTaxCode`). El saldo se acredita por el
   * total recibido (base + impuesto − retención).
   */
  async depositAnticipo(user: RequestUser, dto: RecordAnticipoDto) {
    const base = Number(dto.amount);
    if (!(base > 0)) throw new BadRequestException(apiError('retainer.amountPositive'));

    const matter = await this.getMatterOrThrow(user, dto.matterId);
    if (!matter.tenant.taxId) throw new BadRequestException(apiError('ledger.firmNoTaxId'));
    if (!matter.client.taxId) throw new BadRequestException(apiError('clients.taxIdInvalid'));
    const tenantCurrency = matter.tenant.currency;
    if (dto.currency && dto.currency !== tenantCurrency) {
      throw new BadRequestException(apiError('retainer.currencyMismatch'));
    }

    const account = await this.ensureAccount(user.tenantId, matter.id, tenantCurrency);
    const issueDate = new Date().toISOString().slice(0, 10);
    const now = new Date();
    // Impuesto de línea por jurisdicción (sale del provider; aquí solo el código estándar).
    const taxCode = user.jurisdiction === Jurisdiction.DO ? 'ITBIS_STANDARD' : 'IVA_STANDARD';
    const description = dto.description?.trim() || 'Provisión de fondos (anticipo de honorarios)';

    const out = await tenantTransaction(this.prisma, async (tx) => {
      const { invoice, record } = await this.ledger.emitInvoiceInTx(tx, user, {
        matter: {
          id: matter.id,
          clientId: matter.clientId,
          tenant: {
            name: matter.tenant.name,
            taxId: matter.tenant.taxId,
            currency: tenantCurrency,
          },
          client: { name: matter.client.name, taxId: matter.client.taxId as string },
        },
        lines: [{ description, quantity: '1', unitPrice: base.toFixed(2), taxCode }],
        withholdingTaxCode: dto.withholdingTaxCode,
        issueDate,
        dueDate: new Date(issueDate), // cobrada de inmediato (el anticipo ya se recibió)
      });

      const total = round2(Number(record.totals.total));
      // Cobro inmediato del anticipo: factura PAID + Payment + apunte PAYMENT (espejo del reconcile).
      const payment = await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          invoiceId: invoice.id,
          amount: total.toFixed(2),
          currency: tenantCurrency,
          status: PaymentStatus.SUCCEEDED,
          method: PaymentMethod.MANUAL,
          note: 'Anticipo de provisión',
          paidAt: now,
        },
      });
      await tx.invoice.updateMany({
        where: { id: invoice.id, tenantId: user.tenantId },
        data: { amountPaid: total.toFixed(2), status: InvoiceStatus.PAID, paidAt: now },
      });
      await tx.ledgerEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          type: LedgerEntryType.PAYMENT,
          description: `Cobro factura ${invoice.number}`,
          amount: total.toFixed(2),
          currency: tenantCurrency,
          invoiceId: invoice.id,
        },
      });
      // Acredita el retainer por el TOTAL recibido, ligado a la factura y al cobro.
      const mv = await this.postMovement(tx, user.tenantId, account.id, {
        type: RetainerMovementType.DEPOSIT,
        kind: ProvisionKind.ANTICIPO,
        amount: total.toFixed(2),
        invoiceId: invoice.id,
        paymentId: payment.id,
      });
      return { invoice, record, balance: mv.balance };
    });

    await this.audit.log(user, 'retainer.anticipo', 'Invoice', out.invoice.id, {
      matterId: matter.id,
      number: out.invoice.number,
      base: base.toFixed(2),
      total: out.record.totals.total,
      format: out.record.format,
    });
    return {
      invoiceId: out.invoice.id,
      number: out.invoice.number,
      base: out.record.totals.taxableBase,
      tax: out.record.totals.taxAmount,
      withholding: out.record.totals.withholdingAmount,
      total: out.record.totals.total,
      balance: out.balance,
      compliance: out.record,
    };
  }

  /** Cuenta de provisión de un expediente + movimientos (lectura, acotada al tenant). */
  async getMatterAccount(user: RequestUser, matterId: string) {
    await this.getMatterOrThrow(user, matterId);
    const account = await this.prisma.retainerAccount.findFirst({
      where: { matterId, tenantId: user.tenantId },
      include: { entries: { orderBy: { createdAt: 'desc' }, take: 200 } },
    });
    if (!account) {
      return { matterId, currency: null, balance: '0.00', entries: [] as unknown[] };
    }
    return {
      matterId,
      currency: account.currency,
      balance: account.balance.toFixed(2),
      entries: account.entries.map((e) => ({
        id: e.id,
        type: e.type,
        kind: e.kind,
        amount: e.amount.toFixed(2),
        invoiceId: e.invoiceId,
        note: e.note,
        createdAt: e.createdAt,
      })),
    };
  }

  /** Saldo de provisión POR CLIENTE = Σ de las cuentas de sus expedientes (derivado, no tabla). */
  async getClientAggregate(user: RequestUser, clientId: string) {
    const accounts = await this.prisma.retainerAccount.findMany({
      where: { tenantId: user.tenantId, matter: { clientId } },
      select: { matterId: true, currency: true, balance: true },
    });
    const total = round2(accounts.reduce((sum, a) => sum + Number(a.balance), 0));
    return {
      clientId,
      currency: accounts[0]?.currency ?? null,
      total: total.toFixed(2),
      accounts: accounts.map((a) => ({
        matterId: a.matterId,
        currency: a.currency,
        balance: a.balance.toFixed(2),
      })),
    };
  }

  /**
   * Aplica saldo de provisión al cobro de una factura del MISMO expediente: crea un `Payment` método
   * RETAINER (mueve `amountPaid`, PARTIAL/PAID, apunte PAYMENT — espejo de `reconcile`) y baja el saldo
   * con `RetainerEntry APPLICATION(−)`, todo en una transacción.
   *
   * BLOQUEO POR CONSTRUCCIÓN (D-026/D-027): el saldo de ANTICIPO (ya facturado con IVA) NO se aplica como
   * cobro a ninguna factura. Aplicarlo a una factura normal duplicaría el IVA; aplicarlo a la final de
   * deducción la infrapagaría (la deducción ya lo realiza). El anticipo se REALIZA por su vía propia:
   * `invoiceFinalWithDeduction` (factura final con líneas negativas + drawdown interno). Aquí solo se
   * aplican fondos SUPLIDO/GENERICO.
   */
  async applyToInvoice(user: RequestUser, dto: ApplyRetainerDto) {
    await this.getMatterOrThrow(user, dto.matterId);
    const account = await this.prisma.retainerAccount.findFirst({
      where: { matterId: dto.matterId, tenantId: user.tenantId },
    });
    if (!account || Number(account.balance) <= 0) {
      throw new BadRequestException(apiError('retainer.insufficientBalance'));
    }
    const anticipoCount = await this.prisma.retainerEntry.count({
      where: { tenantId: user.tenantId, accountId: account.id, kind: ProvisionKind.ANTICIPO },
    });
    if (anticipoCount > 0) {
      throw new BadRequestException(apiError('retainer.anticipoApplyBlocked'));
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, tenantId: user.tenantId },
      select: {
        id: true,
        matterId: true,
        number: true,
        currency: true,
        status: true,
        total: true,
        amountPaid: true,
      },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    if (invoice.matterId !== dto.matterId) {
      throw new BadRequestException(apiError('retainer.invoiceNotInMatter'));
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException(apiError('payments.invoiceNotPayable'));
    }
    const outstanding = round2(Number(invoice.total) - Number(invoice.amountPaid));
    if (outstanding <= 0) throw new BadRequestException(apiError('payments.alreadyPaid'));

    const balance = Number(account.balance);
    const amount =
      dto.amount != null ? round2(Number(dto.amount)) : round2(Math.min(outstanding, balance));
    if (!(amount > 0)) throw new BadRequestException(apiError('payments.amountPositive'));
    if (amount > outstanding + EPSILON) {
      throw new BadRequestException(apiError('payments.amountExceedsOutstanding'));
    }
    if (amount > balance + EPSILON) {
      throw new BadRequestException(apiError('retainer.insufficientBalance'));
    }

    const now = new Date();
    const out = await tenantTransaction(this.prisma, async (tx) => {
      // Cobro de la factura con cargo al retainer (espejo de reconcile).
      const payment = await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          invoiceId: invoice.id,
          amount: amount.toFixed(2),
          currency: invoice.currency,
          status: PaymentStatus.SUCCEEDED,
          method: PaymentMethod.RETAINER,
          note: 'Aplicación de provisión',
          paidAt: now,
        },
      });
      const newPaid = round2(Number(invoice.amountPaid) + amount);
      const fullyPaid = newPaid + EPSILON >= Number(invoice.total);
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
          description: `Cobro factura ${invoice.number} (provisión)`,
          amount: amount.toFixed(2),
          currency: invoice.currency,
          invoiceId: invoice.id,
        },
      });
      // Baja el saldo del retainer (APPLICATION −), ligada a la factura y al cobro.
      const mv = await this.postMovement(tx, user.tenantId, account.id, {
        type: RetainerMovementType.APPLICATION,
        amount: (-amount).toFixed(2),
        invoiceId: invoice.id,
        paymentId: payment.id,
      });
      return { applied: amount.toFixed(2), balance: mv.balance, fullyPaid };
    });

    await this.audit.log(user, 'retainer.applied', 'Invoice', invoice.id, {
      matterId: dto.matterId,
      invoiceId: invoice.id,
      amount: out.applied,
    });
    return {
      invoiceId: invoice.id,
      applied: out.applied,
      invoiceStatus: out.fullyPaid ? 'PAID' : 'PARTIAL',
      balance: out.balance,
    };
  }

  /**
   * Emite la FACTURA FINAL de cierre con DEDUCCIÓN del anticipo (D-027 (b)). NO es una rectificativa:
   * factura el servicio completo (líneas del caller, positivas) y añade una LÍNEA NEGATIVA por cada
   * factura de anticipo del expediente, espejo de su base+impuesto. Así el IVA acumulado (anticipo +
   * final) = IVA del total, sin doble imposición; los anticipos quedan inmutables y la final los
   * neutraliza. Reutiliza `buildInvoiceRecord` vía `emitInvoiceInTx` con el bloque `deductedAdvances`
   * (trazabilidad Verifactu/e-CF), encadenada. Tras emitir, REALIZA el anticipo con un `APPLICATION(−)`
   * por el total acreditado, SIN Payment ni mover `amountPaid` (la deducción en la factura es lo que
   * realiza el anticipo; no es un cobro nuevo). TODO ATÓMICO: serie + registro fiscal + ledger + saldo.
   *
   * Guards: exige al menos un anticipo (si no, usar facturación normal); rechaza un segundo cierre
   * (estructural: el drawdown es la única `APPLICATION` sin `paymentId`); rechaza si la base deducida
   * supera la del servicio (sería una devolución → rectificativa, R3c). El refund por diferencias/parcial
   * queda fuera de este PR (R3c).
   */
  async invoiceFinalWithDeduction(user: RequestUser, dto: FinalInvoiceDto) {
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    if (!matter.tenant.taxId) throw new BadRequestException(apiError('ledger.firmNoTaxId'));
    if (!matter.client.taxId) throw new BadRequestException(apiError('clients.taxIdInvalid'));
    const tenantCurrency = matter.tenant.currency;

    const account = await this.prisma.retainerAccount.findFirst({
      where: { matterId: dto.matterId, tenantId: user.tenantId },
    });
    if (!account) throw new BadRequestException(apiError('retainer.noAnticipoToDeduct'));

    // Anticipos del expediente (DEPOSIT kind=ANTICIPO, cada uno con su factura emitida en R2b).
    const anticipoEntries = await this.prisma.retainerEntry.findMany({
      where: {
        tenantId: user.tenantId,
        accountId: account.id,
        type: RetainerMovementType.DEPOSIT,
        kind: ProvisionKind.ANTICIPO,
        invoiceId: { not: null },
      },
    });
    if (anticipoEntries.length === 0) {
      throw new BadRequestException(apiError('retainer.noAnticipoToDeduct'));
    }
    // Estructural: el drawdown de cierre es la ÚNICA `APPLICATION` sin `paymentId` (el apply genérico
    // siempre lleva paymentId). Si ya existe, el expediente ya se cerró con deducción → no repetir.
    const priorClose = await this.prisma.retainerEntry.count({
      where: {
        tenantId: user.tenantId,
        accountId: account.id,
        type: RetainerMovementType.APPLICATION,
        paymentId: null,
      },
    });
    if (priorClose > 0) {
      throw new BadRequestException(apiError('retainer.anticipoAlreadyDeducted'));
    }

    // Facturas de anticipo: base + taxCode de cada una para construir su línea de deducción.
    const anticipoInvoiceIds = anticipoEntries
      .map((e) => e.invoiceId)
      .filter((id): id is string => Boolean(id));
    // Excluir anticipos ya DEVUELTOS (rectificados, R3c): una rectificativa ya reversó su IVA, así que
    // no se deducen en la final (deducirlos doblaría la corrección). El saldo de un anticipo devuelto ya
    // bajó con su REFUND(−), de modo que no entra en el drawdown.
    const refunded = await this.prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        documentType: InvoiceDocumentType.RECTIFICATIVA,
        rectifiesInvoiceId: { in: anticipoInvoiceIds },
      },
      select: { rectifiesInvoiceId: true },
    });
    const refundedIds = new Set(refunded.map((r) => r.rectifiesInvoiceId));
    const activeEntries = anticipoEntries.filter((e) => !refundedIds.has(e.invoiceId));
    if (activeEntries.length === 0) {
      throw new BadRequestException(apiError('retainer.noAnticipoToDeduct'));
    }
    const activeInvoiceIds = activeEntries
      .map((e) => e.invoiceId)
      .filter((id): id is string => Boolean(id));
    const anticipoInvoices = await this.prisma.invoice.findMany({
      where: { id: { in: activeInvoiceIds }, tenantId: user.tenantId },
      include: { lines: { take: 1 } },
    });
    const fallbackTaxCode =
      user.jurisdiction === Jurisdiction.DO ? 'ITBIS_STANDARD' : 'IVA_STANDARD';
    const deductionLines = anticipoInvoices.map((inv) => ({
      description: `Deducción anticipo ${inv.number}`,
      quantity: '1',
      unitPrice: (-Number(inv.taxableBase)).toFixed(2),
      taxCode: inv.lines[0]?.taxCode ?? fallbackTaxCode,
    }));
    const deductedAdvances = anticipoInvoices.map((inv) => ({
      invoiceNumber: inv.number,
      base: Number(inv.taxableBase).toFixed(2),
      taxCode: inv.lines[0]?.taxCode ?? fallbackTaxCode,
    }));

    // Guard D-027 (b): la base del servicio debe cubrir la base deducida; si no, es una devolución
    // (factura rectificativa, R3c), no una deducción.
    const serviceBase = round2(
      dto.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0),
    );
    const deductedBase = round2(
      anticipoInvoices.reduce((s, inv) => s + Number(inv.taxableBase), 0),
    );
    if (deductedBase > serviceBase + EPSILON) {
      throw new BadRequestException(apiError('retainer.deductionExceedsService'));
    }

    // Total a realizar = suma de lo acreditado por los anticipos ACTIVOS (= saldo atribuible a anticipo
    // no devuelto).
    const anticipoTotal = round2(activeEntries.reduce((s, e) => s + Number(e.amount), 0));

    const issueDate = dto.issueDate ?? new Date().toISOString().slice(0, 10);
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : addDaysUtc(new Date(issueDate), DEFAULT_PAYMENT_TERM_DAYS);
    const serviceLines = dto.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode,
    }));

    const out = await tenantTransaction(this.prisma, async (tx) => {
      const { invoice, record } = await this.ledger.emitInvoiceInTx(tx, user, {
        matter: {
          id: matter.id,
          clientId: matter.clientId,
          tenant: {
            name: matter.tenant.name,
            taxId: matter.tenant.taxId,
            currency: tenantCurrency,
          },
          client: { name: matter.client.name, taxId: matter.client.taxId as string },
        },
        lines: [...serviceLines, ...deductionLines],
        withholdingTaxCode: dto.withholdingTaxCode,
        deductedAdvances,
        issueDate,
        dueDate,
      });
      // Realiza el anticipo: APPLICATION(−) por el total acreditado, ligada a la final, SIN paymentId
      // (la deducción en la factura ya lo realiza; no mueve `amountPaid` ni crea Payment).
      const mv = await this.postMovement(tx, user.tenantId, account.id, {
        type: RetainerMovementType.APPLICATION,
        amount: (-anticipoTotal).toFixed(2),
        invoiceId: invoice.id,
        note: `Deducción de anticipos en factura final ${invoice.number}`,
      });
      return { invoice, record, balance: mv.balance };
    });

    await this.audit.log(user, 'retainer.finalInvoice', 'Invoice', out.invoice.id, {
      matterId: matter.id,
      number: out.invoice.number,
      deducted: deductedAdvances.map((a) => a.invoiceNumber),
      total: out.record.totals.total,
      format: out.record.format,
    });
    return {
      invoiceId: out.invoice.id,
      number: out.invoice.number,
      taxableBase: out.record.totals.taxableBase,
      taxAmount: out.record.totals.taxAmount,
      withholdingAmount: out.record.totals.withholdingAmount,
      total: out.record.totals.total,
      deducted: deductedAdvances,
      balance: out.balance,
      compliance: out.record,
    };
  }

  /**
   * Devolución (REFUND) de un anticipo ya facturado (D-027 (c)). NO resta saldo sin más: emite una
   * **factura rectificativa por SUSTITUCIÓN** que reversa el anticipo (espejo en negativo de sus líneas,
   * misma retención), como **registro nuevo encadenado** (Verifactu R1/S · e-CF nota de crédito tipo 34)
   * que referencia la factura rectificada y su causa. La factura de anticipo queda **inmutable**. Tras
   * emitir, registra `RetainerEntry REFUND(−)` por el total devuelto. TODO ATÓMICO.
   *
   * Guards: la factura debe ser un anticipo del expediente, no devuelto ya, no deducido en una factura
   * final (drawdown de cierre presente), y el saldo debe cubrir la devolución. El refund parcial / por
   * diferencias queda fuera de R3c.
   */
  async refundAnticipo(user: RequestUser, dto: RefundAnticipoDto) {
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    if (!matter.tenant.taxId) throw new BadRequestException(apiError('ledger.firmNoTaxId'));
    if (!matter.client.taxId) throw new BadRequestException(apiError('clients.taxIdInvalid'));
    const tenantCurrency = matter.tenant.currency;

    const account = await this.prisma.retainerAccount.findFirst({
      where: { matterId: dto.matterId, tenantId: user.tenantId },
    });
    if (!account) throw new BadRequestException(apiError('retainer.notAnAnticipoInvoice'));

    // La factura debe ser un ANTICIPO de este expediente (ligada a un DEPOSIT ANTICIPO de su cuenta).
    const anticipoEntry = await this.prisma.retainerEntry.findFirst({
      where: {
        tenantId: user.tenantId,
        accountId: account.id,
        type: RetainerMovementType.DEPOSIT,
        kind: ProvisionKind.ANTICIPO,
        invoiceId: dto.anticipoInvoiceId,
      },
    });
    if (!anticipoEntry) {
      throw new BadRequestException(apiError('retainer.notAnAnticipoInvoice'));
    }
    const anticipo = await this.prisma.invoice.findFirst({
      where: { id: dto.anticipoInvoiceId, tenantId: user.tenantId },
      include: { lines: true },
    });
    if (!anticipo) throw new NotFoundException(apiError('ledger.invoiceNotFound'));

    // No devolver dos veces: ya existe una rectificativa que corrige esta factura.
    const alreadyRefunded = await this.prisma.invoice.count({
      where: {
        tenantId: user.tenantId,
        documentType: InvoiceDocumentType.RECTIFICATIVA,
        rectifiesInvoiceId: anticipo.id,
      },
    });
    if (alreadyRefunded > 0) {
      throw new BadRequestException(apiError('retainer.anticipoAlreadyRefunded'));
    }
    // No devolver un anticipo ya deducido en una factura final (drawdown de cierre = APPLICATION sin
    // paymentId): ese anticipo ya se realizó, su corrección sería otra operación.
    const closed = await this.prisma.retainerEntry.count({
      where: {
        tenantId: user.tenantId,
        accountId: account.id,
        type: RetainerMovementType.APPLICATION,
        paymentId: null,
      },
    });
    if (closed > 0) {
      throw new BadRequestException(apiError('retainer.anticipoAlreadyDeducted'));
    }

    const refundTotal = round2(Number(anticipo.total));
    if (Number(account.balance) + EPSILON < refundTotal) {
      throw new BadRequestException(apiError('retainer.insufficientBalance'));
    }

    const issueDate = new Date().toISOString().slice(0, 10);
    // Reversa el anticipo: espejo en negativo de cada línea (base y, vía withholdingTaxCode, la retención).
    const reversalLines = anticipo.lines.map((l) => ({
      description: `Devolución anticipo ${anticipo.number}: ${l.description}`,
      quantity: l.quantity.toString(),
      unitPrice: (-Number(l.unitPrice)).toFixed(2),
      taxCode: l.taxCode,
    }));

    const out = await tenantTransaction(this.prisma, async (tx) => {
      const { invoice, record } = await this.ledger.emitInvoiceInTx(tx, user, {
        matter: {
          id: matter.id,
          clientId: matter.clientId,
          tenant: {
            name: matter.tenant.name,
            taxId: matter.tenant.taxId,
            currency: tenantCurrency,
          },
          client: { name: matter.client.name, taxId: matter.client.taxId as string },
        },
        lines: reversalLines,
        withholdingTaxCode: anticipo.withholdingTaxCode ?? undefined,
        rectification: {
          rectifiedInvoiceId: anticipo.id,
          rectifiedNumber: anticipo.number,
          rectifiedIssueDate: anticipo.issueDate.toISOString().slice(0, 10),
          reason: dto.reason,
          mode: RectificationMode.SUSTITUCION,
        },
        issueDate,
        dueDate: new Date(issueDate),
      });
      // Devolución del saldo: REFUND(−), ligada a la rectificativa.
      const mv = await this.postMovement(tx, user.tenantId, account.id, {
        type: RetainerMovementType.REFUND,
        amount: (-refundTotal).toFixed(2),
        invoiceId: invoice.id,
        note: `Devolución de anticipo ${anticipo.number} (rectificativa ${invoice.number})`,
      });
      return { invoice, record, balance: mv.balance };
    });

    await this.audit.log(user, 'retainer.refund', 'Invoice', out.invoice.id, {
      matterId: matter.id,
      number: out.invoice.number,
      rectifies: anticipo.number,
      total: out.record.totals.total,
      format: out.record.format,
    });
    return {
      invoiceId: out.invoice.id,
      number: out.invoice.number,
      rectifies: anticipo.number,
      total: out.record.totals.total,
      balance: out.balance,
      compliance: out.record,
    };
  }

  // ── Motor de saldo (reutilizable por R3) ──────────────────────────────────
  /**
   * Busca o crea la cuenta de retainer del expediente (1 por expediente, moneda del tenant), en
   * operaciones AUTOCOMMIT (no dentro de una transacción larga). Bajo carrera del primer depósito, el
   * INSERT perdedor bloquea en el índice único hasta que el ganador confirma y luego cae en P2002 →
   * re-lee la fila ya confirmada. Devuelve siempre una cuenta confirmada y visible.
   */
  private async ensureAccount(tenantId: string, matterId: string, currency: 'EUR' | 'DOP') {
    const existing = await this.prisma.retainerAccount.findUnique({ where: { matterId } });
    if (existing) return existing;
    try {
      return await this.prisma.retainerAccount.create({ data: { tenantId, matterId, currency } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.retainerAccount.findUniqueOrThrow({ where: { matterId } });
      }
      throw err;
    }
  }

  /**
   * Aplica un movimiento sobre la cuenta de forma atómica y SERIALIZADA: bloquea la fila de la cuenta
   * con `SELECT … FOR UPDATE` (dos movimientos concurrentes no se pisan), aplica el guard de saldo
   * negativo, inserta el `RetainerEntry` y actualiza el saldo cacheado en la MISMA transacción.
   * Invariante: `balance == Σ(amount de entries)`. El llamador provee `amount` con signo.
   */
  private async postMovement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    accountId: string,
    m: MovementInput,
  ) {
    // Lock de fila (FOR UPDATE) para serializar movimientos concurrentes sobre la misma cuenta.
    const locked = await tx.$queryRaw<{ balance: string }[]>`
      SELECT balance::text AS balance FROM "RetainerAccount" WHERE id = ${accountId} FOR UPDATE`;
    const row = locked[0];
    // Invariante interno: la cuenta se asegura en la misma transacción antes de mover; si no aparece
    // (bloqueada), es una inconsistencia, no un caso de negocio.
    if (!row) throw new Error(`RetainerAccount ${accountId} no encontrada para FOR UPDATE`);
    const current = Number(row.balance);
    const next = round2(current + Number(m.amount));
    if (next < -EPSILON) {
      throw new BadRequestException(apiError('retainer.insufficientBalance'));
    }
    const entry = await tx.retainerEntry.create({
      data: {
        tenantId,
        accountId,
        type: m.type,
        kind: m.kind ?? null,
        amount: m.amount,
        invoiceId: m.invoiceId ?? null,
        paymentId: m.paymentId ?? null,
        note: m.note ?? null,
      },
    });
    await tx.retainerAccount.update({
      where: { id: accountId },
      data: { balance: next.toFixed(2) },
    });
    return { accountId, entryId: entry.id, balance: next.toFixed(2) };
  }
}
