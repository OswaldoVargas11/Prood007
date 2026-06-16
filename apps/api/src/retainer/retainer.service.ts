import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Jurisdiction,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  PaymentStatus,
  ProvisionKind,
  RetainerMovementType,
} from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { apiError } from '../common/api-messages';
import { RecordDepositDto } from './dto/record-deposit.dto';
import { RecordAnticipoDto } from './dto/record-anticipo.dto';
import { ApplyRetainerDto } from './dto/apply-retainer.dto';
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
   * BLOQUEO POR CONSTRUCCIÓN (D-026): si el expediente tiene fondos de ANTICIPO (ya facturados con IVA),
   * aplicarlos a una factura requiere la DEDUCCIÓN fiscal del anticipo (R3b, pendiente de ratificación)
   * para no cobrar el IVA dos veces → se rechaza. Solo se aplican fondos SUPLIDO/GENERICO por ahora.
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
