import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProvisionKind, RetainerMovementType } from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { RecordDepositDto } from './dto/record-deposit.dto';
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
 * Provisión de fondos / retainer (saldo por expediente). PR-R2: motor de saldo + tipos NO fiscales
 * (SUPLIDO, GENERICO) + lecturas. El tipo ANTICIPO está BLOQUEADO aquí (devenga IVA/ITBIS y exige
 * emisión de factura, que llega en R2b): un anticipo nunca se registra como saldo sin su factura.
 */
@Injectable()
export class RetainerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getMatterOrThrow(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      include: {
        tenant: { select: { currency: true } },
        client: { select: { id: true, name: true } },
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
