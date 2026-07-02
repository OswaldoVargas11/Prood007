import { createHash } from 'crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EcfStatus, Prisma, VerifactuStatus, type Currency } from '@prisma/client';
import {
  ApprovalStatus,
  InvoiceDocumentType,
  InvoiceStatus,
  Jurisdiction,
  LedgerEntryType,
  RectificationMode,
  STORAGE_PROVIDER,
} from '@legalflow/domain';
import type { StorageProvider } from '@legalflow/domain';
import { InvoiceRecord, round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLedgerEntryDto, MANUAL_LEDGER_TYPES } from './dto/create-ledger-entry.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { ListTimeQueryDto } from './dto/list-time.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.dto';
import { PreviewInvoiceDto } from './dto/preview-invoice.dto';
import { ProposeCostDto } from './dto/propose-cost.dto';
import { RectifyInvoiceDto } from './dto/rectify-invoice.dto';
import { ResolveApprovalDto } from './dto/resolve-approval.dto';
import { apiError } from '../common/api-messages';
import { buildInvoicePdf, invoiceRowToPdfData } from './invoice-pdf';
import { isInlineSafeMime, sniffSafeUploadType } from '../common/safe-download';
import { PaymentsService } from '../payments/payments.service';
import { EcfTransmissionService } from '../dgii/ecf-transmission.service';
import { DgiiConfig } from '../dgii/dgii.config';
import { assertCanEmitFormat } from './emission-guard';
import { VerifactuConfig } from '../verifactu/verifactu.config';
import { VerifactuRegistroService } from '../verifactu/verifactu-registro.service';
import { VerifactuSubmissionService } from '../verifactu/verifactu-submission.service';
import {
  DEFAULT_PAYMENT_TERM_DAYS,
  addDaysUtc,
  deriveOverdue,
  startOfTodayUtc,
} from './overdue.util';
import type { RequestUser } from '../auth/auth.types';
// Primitivas de la cadena fiscal inmutable (génesis, serialización canónica y append encadenado),
// compartidas con la transmisión e-CF (módulo dgii) para que el encadenado tenga UNA sola implementación.
import { GENESIS_HASH, appendFiscalEvent, canonicalJson } from './fiscal-chain';

/**
 * Ledger jurídico transparente + facturación.
 *
 * Convención de signo para el saldo (lo que el cliente ve en tiempo real):
 *  - PROVISION / PAYMENT  → +  (fondos aportados por el cliente)
 *  - DISBURSEMENT / TIME_FEE / FEE → −  (gastos y honorarios)
 *  - ADJUSTMENT → +  (el importe puede ser negativo para ajustes a la baja)
 *  - INVOICE → 0  (la factura es un documento que resume cargos ya reflejados; no mueve saldo)
 */
const BALANCE_SIGN: Record<LedgerEntryType, number> = {
  [LedgerEntryType.PROVISION]: 1,
  [LedgerEntryType.PAYMENT]: 1,
  [LedgerEntryType.DISBURSEMENT]: -1,
  [LedgerEntryType.TIME_FEE]: -1,
  [LedgerEntryType.FEE]: -1,
  [LedgerEntryType.ADJUSTMENT]: 1,
  [LedgerEntryType.INVOICE]: 0,
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly ecfTransmission: EcfTransmissionService,
    private readonly dgiiConfig: DgiiConfig,
    private readonly verifactuConfig: VerifactuConfig,
    private readonly verifactuRegistro: VerifactuRegistroService,
    private readonly verifactuSubmission: VerifactuSubmissionService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private async getMatterOrThrow(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      include: { client: true, tenant: true },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
    return matter;
  }

  // ── Apuntes manuales ────────────────────────────────────────────────────
  async addEntry(user: RequestUser, dto: CreateLedgerEntryDto) {
    if (!MANUAL_LEDGER_TYPES.includes(dto.type as (typeof MANUAL_LEDGER_TYPES)[number])) {
      throw new BadRequestException(apiError('ledger.manualTypeNotAllowed'));
    }
    const amount = Number(dto.amount);
    if (dto.type !== LedgerEntryType.ADJUSTMENT && amount < 0) {
      throw new BadRequestException(apiError('ledger.amountPositiveForType'));
    }
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    const entry = await this.prisma.ledgerEntry.create({
      data: {
        tenantId: user.tenantId,
        matterId: matter.id,
        type: dto.type,
        description: dto.description,
        amount: dto.amount,
        currency: matter.tenant.currency,
      },
    });
    await this.audit.log(user, 'ledger.entry_added', 'LedgerEntry', entry.id, { type: dto.type });
    return entry;
  }

  // ── Horas con tarifa ────────────────────────────────────────────────────
  async addTimeEntry(user: RequestUser, dto: CreateTimeEntryDto) {
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    // Tarifa: la del parte si viene; si no, la tarifa de facturación (billRate) del letrado (rate card).
    let rate = dto.hourlyRate;
    if (rate == null || rate === '') {
      const me = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { billRate: true },
      });
      if (!me?.billRate) throw new BadRequestException(apiError('ledger.rateRequired'));
      rate = me.billRate.toString();
    }
    const feeAmount = round2((dto.minutes / 60) * Number(rate));

    const result = await tenantTransaction(this.prisma, async (tx) => {
      const time = await tx.timeEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          userId: user.userId,
          description: dto.description,
          minutes: dto.minutes,
          hourlyRate: rate,
          workedAt: new Date(dto.workedAt),
        },
      });
      const ledger = await tx.ledgerEntry.create({
        data: {
          tenantId: user.tenantId,
          matterId: matter.id,
          type: LedgerEntryType.TIME_FEE,
          description: `Honorarios (${(dto.minutes / 60).toFixed(2)} h): ${dto.description}`,
          amount: feeAmount.toFixed(2),
          currency: matter.tenant.currency,
        },
      });
      return { time, ledger };
    });
    await this.audit.log(user, 'time.logged', 'TimeEntry', result.time.id, { feeAmount });
    return result;
  }

  /**
   * Listado de fichas de tiempo (captura sin fricción). Acotado al tenant por RLS. Soporta el repaso
   * del día (`mine` + `date`) y el "tiempo sin facturar" (`unbilled`). Calcula el honorario por ficha
   * (minutos/60 × tarifa) y los totales para que la UI no recalcule.
   */
  async listTime(user: RequestUser, query: ListTimeQueryDto) {
    const where: {
      tenantId: string;
      userId?: string;
      billed?: boolean;
      matterId?: string;
      workedAt?: { gte: Date; lt: Date };
    } = { tenantId: user.tenantId };
    if (query.mine === 'true') where.userId = user.userId;
    if (query.unbilled === 'true') where.billed = false;
    if (query.matterId) where.matterId = query.matterId;
    if (query.date) {
      const start = new Date(query.date);
      where.workedAt = { gte: start, lt: new Date(start.getTime() + 86_400_000) };
    }

    const [rows, tenant] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        orderBy: { workedAt: 'desc' },
        include: { matter: { select: { id: true, reference: true, title: true } } },
      }),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { currency: true },
      }),
    ]);

    let totalMinutes = 0;
    let totalFee = 0;
    const entries = rows.map((r) => {
      const fee = round2((r.minutes / 60) * Number(r.hourlyRate));
      totalMinutes += r.minutes;
      totalFee += fee;
      return {
        id: r.id,
        description: r.description,
        minutes: r.minutes,
        hourlyRate: r.hourlyRate.toString(),
        workedAt: r.workedAt,
        billed: r.billed,
        fee: fee.toFixed(2),
        matter: r.matter,
      };
    });

    return {
      entries,
      totalMinutes,
      totalFee: round2(totalFee).toFixed(2),
      currency: tenant.currency,
    };
  }

  // ── Vista del ledger (transparente) ─────────────────────────────────────
  async getMatterLedger(user: RequestUser, matterId: string) {
    const matter = await this.getMatterOrThrow(user, matterId);
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { occurredAt: 'asc' },
    });
    // Solo los apuntes APROBADOS mueven el saldo; los propuestos/rechazados no.
    const balance = entries.reduce(
      (sum, e) =>
        e.approvalStatus === ApprovalStatus.APPROVED
          ? sum + BALANCE_SIGN[e.type as LedgerEntryType] * Number(e.amount)
          : sum,
      0,
    );
    return {
      matterId,
      currency: matter.tenant.currency,
      balance: round2(balance).toFixed(2),
      // No exponemos la clave de almacenamiento; solo si hay justificante y su nombre.
      entries: entries.map(({ receiptKey, receiptMime, ...e }) => ({
        ...e,
        hasReceipt: Boolean(receiptKey),
      })),
    };
  }

  /** Descarga del justificante de un suplido (acotado al tenant). Lanza 404 si no hay. */
  async getReceipt(user: RequestUser, entryId: string) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { id: entryId, tenantId: user.tenantId },
      select: { receiptKey: true, receiptName: true, receiptMime: true },
    });
    if (!entry?.receiptKey) throw new NotFoundException(apiError('ledger.receiptNotFound'));
    const buffer = await this.storage.get(entry.receiptKey);
    return {
      buffer,
      mime: entry.receiptMime ?? 'application/octet-stream',
      name: entry.receiptName ?? 'justificante',
    };
  }

  // ── Facturación ─────────────────────────────────────────────────────────

  /**
   * Pre-cálculo fiscal READ-ONLY (sin crear factura ni mover estado). Resuelve el provider de la
   * jurisdicción del tenant y delega en `previewInvoice`, que comparte la MISMA matemática fiscal
   * que la emisión real (`buildInvoiceRecord`): preview y factura emitida nunca divergen.
   */
  previewInvoice(user: RequestUser, dto: PreviewInvoiceDto) {
    // El formato elegido (si lo hay) decide el provider; por defecto, la jurisdicción del tenant.
    const provider = this.compliance.forTenant({
      jurisdiction: dto.invoiceFormat ?? user.jurisdiction,
    });
    // La descripción no interviene en la matemática fiscal; se completa neutra para el tipo de línea.
    const lines = dto.lines.map((l) => ({
      description: '',
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode,
    }));
    try {
      return provider.previewInvoice(lines, dto.withholdingTaxCode);
    } catch {
      throw new BadRequestException(
        'No se pudo calcular el preview fiscal con los datos indicados.',
      );
    }
  }

  async createInvoice(user: RequestUser, dto: CreateInvoiceDto) {
    const matter = await this.getMatterOrThrow(user, dto.matterId);
    if (!matter.tenant.taxId) {
      throw new BadRequestException(apiError('ledger.firmNoTaxId'));
    }
    const issueDate = dto.issueDate ?? new Date().toISOString().slice(0, 10);
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : addDaysUtc(new Date(issueDate), DEFAULT_PAYMENT_TERM_DAYS);

    const { invoice, record } = await tenantTransaction(this.prisma, (tx) =>
      this.emitInvoiceInTx(tx, user, {
        matter,
        lines: dto.lines,
        withholdingTaxCode: dto.withholdingTaxCode,
        currency: dto.currency,
        invoiceFormat: dto.invoiceFormat,
        issueDate,
        dueDate,
      }),
    );

    await this.audit.log(user, 'invoice.issued', 'Invoice', invoice.id, {
      number: invoice.number,
      total: record.totals.total,
      format: record.format,
    });
    // e-CF (RD): tras emitir (ya commiteada), transmitir a la DGII FUERA de la transacción y best-effort.
    // Si la DGII está apagada o falla, la factura queda con su estado (STUBBED/REJECTED) para reintentar
    // desde el endpoint; la emisión NUNCA se rompe por la transmisión.
    if (record.format === 'ECF') {
      const result = await this.ecfTransmission
        .transmit(user.tenantId, invoice.id)
        .catch(() => null);
      if (result) invoice.ecfStatus = result.status;
    }
    // Verifactu (ES): misma mecánica — remisión a la AEAT fuera de la transacción y best-effort (un
    // fallo deja el registro PENDING y el cron lo reintenta). Solo si la emisión lo dejó a remitir.
    if (record.format === 'VERIFACTU' && invoice.verifactuStatus === VerifactuStatus.PENDING) {
      const result = await this.verifactuSubmission
        .transmit(user.tenantId, invoice.id)
        .catch(() => null);
      if (result) invoice.verifactuStatus = result.status;
    }
    return { invoice, compliance: record };
  }

  /**
   * Núcleo de emisión fiscal DENTRO de una transacción dada: consume la serie (count dentro de la tx),
   * encadena con la huella anterior, llama a `buildInvoiceRecord` (mismo registro Verifactu/e-CF que la
   * emisión normal — sin atajos) y persiste factura + líneas + apunte `INVOICE`. NO cobra: nace ISSUED;
   * el llamador decide el cobro. Reutilizado por la emisión normal y por la factura de anticipo del
   * retainer (R2b), de modo que serie + registro + ledger queden en la MISMA transacción que el saldo.
   */
  async emitInvoiceInTx(
    // Actor mínimo: el núcleo de emisión solo necesita tenant + jurisdicción (resuelve el provider). Así
    // lo pueden invocar tanto las rutas con `RequestUser` como procesos sin request (cron de facturación).
    tx: Prisma.TransactionClient,
    user: { tenantId: string; jurisdiction: RequestUser['jurisdiction'] },
    p: {
      matter: {
        id: string;
        clientId: string;
        tenant: { name: string; taxId: string | null; currency: Currency };
        client: { name: string; taxId: string };
      };
      lines: { description: string; quantity: string; unitPrice: string; taxCode: string }[];
      withholdingTaxCode?: string;
      /** Moneda de la factura. Por defecto, la del tenant. */
      currency?: Currency;
      /**
       * Formato fiscal de la factura (es = Verifactu/ES · do = e-CF/RD), elegible por el despacho y
       * DESACOPLADO de la jurisdicción del tenant: selecciona el provider y la presentación del PDF.
       * Por defecto, la jurisdicción del tenant.
       */
      invoiceFormat?: RequestUser['jurisdiction'];
      /**
       * Facturas de anticipo deducidas en esta factura (solo la factura final de cierre, D-027 (b)).
       * Las líneas negativas que neutralizan base+impuesto van en `lines`; este bloque referencia los
       * documentos de anticipo para la trazabilidad del registro fiscal (Verifactu/e-CF).
       */
      deductedAdvances?: { invoiceNumber: string; base: string; taxCode: string }[];
      /**
       * Marca esta emisión como FACTURA RECTIFICATIVA (D-027 (c)) que corrige una factura ya emitida.
       * `rectifiedInvoiceId` enlaza la rectificada (FK); el resto alimenta el registro fiscal
       * (Verifactu R1/S·I · e-CF nota de crédito). Ausente → factura NORMAL.
       */
      rectification?: {
        rectifiedInvoiceId: string;
        rectifiedNumber: string;
        rectifiedIssueDate?: string;
        reason: string;
        mode: RectificationMode;
      };
      issueDate: string;
      dueDate: Date;
    },
  ): Promise<{
    invoice: Prisma.InvoiceGetPayload<{ include: { lines: true } }>;
    record: InvoiceRecord;
  }> {
    // Moneda y formato EFECTIVOS: lo elegido en la factura o, por defecto, lo del tenant. El formato
    // (no la jurisdicción) selecciona el provider fiscal y la presentación del PDF.
    const currency = p.currency ?? p.matter.tenant.currency;
    const invoiceFormat = p.invoiceFormat ?? user.jurisdiction;
    const provider = this.compliance.forTenant({ jurisdiction: invoiceFormat });
    // Serializa la emisión POR TENANT (lock transaccional de aviso; espacio 2 = serie de factura, distinto
    // del de plazas). Evita que dos emisiones concurrentes calculen el mismo `number` (→ P2002 → reversión
    // → HUECO en la serie) o encadenen contra la MISMA huella anterior (→ bifurcación de la cadena fiscal).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${user.tenantId}))`;
    const tenantRow = await tx.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { invoiceSeries: true, certificateKey: true },
    });
    const series = tenantRow.invoiceSeries || 'FAC';
    // Verja de capacidad de emisión (Parte A): valida ANTES de numerar/emitir que el despacho PUEDE emitir
    // en el formato pedido. RD (e-CF): un rango eNCF vencido/agotado corta siempre; con la transmisión a la
    // DGII activada, exige además un rango vigente registrado + certificado del despacho. ES/Verifactu no
    // tiene verja (régimen aplazado). Bajo el advisory lock, así que la lectura del rango no tiene carreras.
    const ncfType = p.rectification ? '34' : '31';
    const ecfRange =
      invoiceFormat === Jurisdiction.DO
        ? await tx.ecfSequence.findUnique({
            where: { tenantId_ncfType: { tenantId: user.tenantId, ncfType } },
            select: { expiresAt: true, next: true, rangeEnd: true },
          })
        : null;
    assertCanEmitFormat({
      invoiceFormat,
      ncfType,
      ecfRange,
      hasEcfCertificate: Boolean(tenantRow.certificateKey),
      dgiiEnabled: this.dgiiConfig.enabled,
      now: Date.now(),
    });
    // Numeración fiscal del país. Todo bajo el advisory lock de emisión por tenant (sin carreras):
    //  - RD (e-CF): el número ES el eNCF, tomado de un RANGO AUTORIZADO por la DGII del despacho
    //    (`EcfSequence`), no de una serie interna (D8-005). Tipo 34 = nota de crédito (rectificativa); 31 =
    //    crédito fiscal por defecto.
    //  - ES (Verifactu) y resto: correlativo monótono por serie+año vía `InvoiceSequence` (no `COUNT(*)`,
    //    sin huecos/duplicados, D8-002). Año = el de la fecha de expedición (no el reloj de pared).
    const fiscalYear = p.issueDate.slice(0, 4);
    let number: string | null = null;
    if (invoiceFormat === Jurisdiction.DO) {
      // Si el despacho YA registró un rango eNCF autorizado, numeramos desde él (34 nota de crédito para
      // rectificativas, 31 crédito fiscal por defecto). Si AÚN no lo ha registrado, caemos a la serie
      // interna (comportamiento previo): así el despacho sigue operando hasta dar de alta sus rangos en la
      // DGII, y un rango vencido/agotado sí corta la emisión con un error claro (ver allocateEncf).
      number = await this.allocateEncf(tx, user.tenantId, ncfType);
    }
    if (number === null) {
      const next = await this.nextSequence(tx, user.tenantId, `${series}:${fiscalYear}`);
      number = `${series}-${fiscalYear}-${String(next).padStart(4, '0')}`;
    }
    // Enlace de la cadena: huella del último registro emitido del tenant. Orden determinista (createdAt, id)
    // y, dado que el borrado de facturas emitidas está vetado a nivel de BD, la cadena no puede re-enraizarse.
    const previous = await tx.invoice.findFirst({
      where: { tenantId: user.tenantId, recordHash: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { recordHash: true },
    });
    const record = await provider.buildInvoiceRecord({
      invoiceNumber: number,
      issueDate: p.issueDate,
      currency,
      seller: { name: p.matter.tenant.name, taxId: p.matter.tenant.taxId as string },
      buyer: { name: p.matter.client.name, taxId: p.matter.client.taxId },
      lines: p.lines,
      withholdingTaxCode: p.withholdingTaxCode,
      deductedAdvances: p.deductedAdvances,
      documentType: p.rectification
        ? InvoiceDocumentType.RECTIFICATIVA
        : InvoiceDocumentType.NORMAL,
      rectifies: p.rectification
        ? {
            invoiceNumber: p.rectification.rectifiedNumber,
            issueDate: p.rectification.rectifiedIssueDate,
            reason: p.rectification.reason,
            mode: p.rectification.mode,
          }
        : undefined,
      previousRecordHash: previous?.recordHash ?? GENESIS_HASH,
    });
    // Registro de facturación AEAT (solo VERIFACTU): XML del RegistroAlta + huella AEAT (cadena PROPIA,
    // separada de recordHash — el formato de la cadena interna no cambia) + firma XAdES-BES si el
    // despacho tiene certificado. Nace en el INSERT porque esas columnas son inalterables para el rol de
    // app. Best-effort: un fallo generando el registro AEAT no rompe la emisión (queda el detalle).
    let verifactu: { xml: string; huella: string; signedBy: string | null } | null = null;
    let verifactuDetail: string | null = null;
    if (record.format === 'VERIFACTU') {
      try {
        verifactu = await this.verifactuRegistro.buildAndSign(tx, user.tenantId, {
          nifEmisor: p.matter.tenant.taxId as string,
          nombreRazonEmisor: p.matter.tenant.name,
          numSerieFactura: number,
          fechaExpedicion: p.issueDate,
          destinatario: { nombreRazon: p.matter.client.name, nif: p.matter.client.taxId },
          rectificacion: p.rectification
            ? {
                tipoRectificativa:
                  p.rectification.mode === RectificationMode.SUSTITUCION ? 'S' : 'I',
                rectifiedNumber: p.rectification.rectifiedNumber,
                rectifiedIssueDate: p.rectification.rectifiedIssueDate,
                reason: p.rectification.reason,
              }
            : undefined,
          lines: p.lines,
          rates: provider.getTaxRates().rates,
          totals: record.totals,
        });
        if (!verifactu.signedBy) {
          verifactuDetail =
            'Registro generado SIN firma: el despacho no tiene certificado Verifactu (súbelo en Ajustes).';
        }
      } catch (err) {
        verifactuDetail =
          `No se pudo generar el registro Verifactu: ${(err as Error).message}`.slice(0, 1000);
      }
    }
    const invoice = await tx.invoice.create({
      data: {
        tenantId: user.tenantId,
        matterId: p.matter.id,
        clientId: p.matter.clientId,
        number,
        status: InvoiceStatus.ISSUED,
        issueDate: new Date(p.issueDate),
        dueDate: p.dueDate,
        currency,
        invoiceFormat,
        taxableBase: record.totals.taxableBase,
        taxAmount: record.totals.taxAmount,
        withholdingAmount: record.totals.withholdingAmount,
        withholdingTaxCode: p.withholdingTaxCode ?? null,
        total: record.totals.total,
        complianceFormat: record.format,
        complianceRecord: record.payload as object,
        recordHash: record.recordHash,
        previousRecordHash: previous?.recordHash ?? GENESIS_HASH,
        // Estado inicial del e-CF: STUBBED para RD (lo transmite createInvoice tras emitir, si está
        // activado); NOT_APPLICABLE para ES/Verifactu. La transmisión real nunca va dentro de la tx.
        ecfStatus: record.format === 'ECF' ? EcfStatus.STUBBED : EcfStatus.NOT_APPLICABLE,
        // Registro Verifactu (AEAT): inalterable desde el INSERT. PENDING = a remitir (inline tras la
        // emisión o cron); STUBBED = remisión apagada al emitir (VERIFACTU_ENV sin definir; activarla
        // después no re-remite el histórico). La remisión real nunca va dentro de la tx.
        verifactuXml: verifactu?.xml ?? null,
        verifactuHuella: verifactu?.huella ?? null,
        verifactuSignedBy: verifactu?.signedBy ?? null,
        verifactuStatus: verifactu
          ? this.verifactuConfig.enabled
            ? VerifactuStatus.PENDING
            : VerifactuStatus.STUBBED
          : VerifactuStatus.NOT_APPLICABLE,
        verifactuStatusDetail: verifactuDetail,
        documentType: p.rectification
          ? InvoiceDocumentType.RECTIFICATIVA
          : InvoiceDocumentType.NORMAL,
        rectifiesInvoiceId: p.rectification?.rectifiedInvoiceId ?? null,
        rectificationReason: p.rectification?.reason ?? null,
        rectificationMode: p.rectification?.mode ?? null,
        lines: {
          create: p.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxCode: l.taxCode,
            lineTotal: round2(Number(l.quantity) * Number(l.unitPrice)).toFixed(2),
          })),
        },
      },
      include: { lines: true },
    });
    await tx.ledgerEntry.create({
      data: {
        tenantId: user.tenantId,
        matterId: p.matter.id,
        type: LedgerEntryType.INVOICE,
        description: `Factura ${number}`,
        amount: record.totals.total,
        currency,
        invoiceId: invoice.id,
      },
    });
    // Registro de eventos fiscal INMUTABLE y encadenado (RRSIF, art. registro de eventos): alta de la
    // factura emitida. La tabla es append-only para el rol de app (sin UPDATE/DELETE), de modo que el
    // rastro de emisión no puede reescribirse ni borrarse aunque se altere la factura.
    await this.appendFiscalEvent(tx, user.tenantId, invoice.id, 'invoice.issued', {
      number,
      total: record.totals.total,
      format: record.format,
      recordHash: record.recordHash,
      documentType: invoice.documentType,
    });
    return { invoice, record };
  }

  /**
   * Incremento atómico del contador de emisión por tenant para un `scope` (p. ej. "FAC:2026"). Devuelve el
   * nuevo valor. Va SIEMPRE dentro del advisory lock de emisión, así que es libre de carreras; el upsert raw
   * garantiza que el primer uso arranca en 1 y nunca reutiliza un número (a diferencia de COUNT(*)+1).
   */
  private async nextSequence(
    tx: Prisma.TransactionClient,
    tenantId: string,
    scope: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "InvoiceSequence" ("tenantId", "scope", "value")
      VALUES (${tenantId}, ${scope}, 1)
      ON CONFLICT ("tenantId", "scope")
      DO UPDATE SET "value" = "InvoiceSequence"."value" + 1
      RETURNING "value"`;
    const row = rows[0];
    if (!row) throw new Error('No se pudo obtener el correlativo de factura.');
    return row.value;
  }

  /**
   * Asigna el siguiente eNCF de un RANGO AUTORIZADO por la DGII para el despacho y tipo de comprobante
   * (D8-005). Bajo el advisory lock de emisión (sin concurrencia por tenant): lee el rango, consume el
   * número e incrementa `next`. eNCF = `E`+tipo+10 dígitos. Devuelve `null` si el despacho aún no tiene
   * rango registrado (el llamador cae a la serie interna); lanza si el rango está VENCIDO o AGOTADO, para
   * que el despacho lo renueve en la DGII antes de seguir emitiendo e-CF.
   */
  private async allocateEncf(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ncfType: string,
  ): Promise<string | null> {
    const seq = await tx.ecfSequence.findUnique({
      where: { tenantId_ncfType: { tenantId, ncfType } },
    });
    // Sin rango registrado → null: el llamador cae a la serie interna (el despacho aún no dio de alta sus
    // eNCF en la DGII). Un rango vencido o agotado SÍ corta la emisión (es una incidencia a resolver).
    if (!seq) return null;
    if (seq.expiresAt && seq.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(apiError('dgii.encfRangeExpired', { params: { ncfType } }));
    }
    if (seq.next > seq.rangeEnd) {
      throw new BadRequestException(apiError('dgii.encfRangeExhausted', { params: { ncfType } }));
    }
    const used = seq.next;
    await tx.ecfSequence.update({
      where: { tenantId_ncfType: { tenantId, ncfType } },
      data: { next: used + 1 },
    });
    return `E${ncfType}${String(used).padStart(10, '0')}`;
  }

  /**
   * Añade un evento al registro fiscal inmutable encadenándolo con la huella del evento anterior del tenant
   * (génesis = 64 ceros). Determinista por orden (createdAt, id). El rol de app solo tiene INSERT/SELECT.
   * Implementación compartida en `fiscal-chain.ts` (la usa también la transmisión e-CF a la DGII).
   */
  private async appendFiscalEvent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string | null,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await appendFiscalEvent(tx, tenantId, invoiceId, type, payload);
  }

  /**
   * Verifica la integridad de la cadena fiscal de un tenant (huella encadenada de eventos). Pensado para un
   * cron/endpoint de conciliación: recorre los eventos en orden y comprueba que cada `previousEventHash`
   * coincide con la huella del anterior y que la huella es reproducible. Devuelve el primer punto de ruptura.
   */
  async verifyFiscalChain(
    tenantId: string,
  ): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
    const events = await this.prisma.fiscalEvent.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        invoiceId: true,
        payload: true,
        recordHash: true,
        previousEventHash: true,
      },
    });
    let expectedPrev = GENESIS_HASH;
    for (const e of events) {
      const prevHash = e.previousEventHash ?? '';
      const recordOf = (payloadStr: string) =>
        createHash('sha256')
          .update([e.type, e.invoiceId ?? '', payloadStr, prevHash].join('|'))
          .digest('hex');
      // Canónico (formato nuevo, L-5) con fallback al `JSON.stringify` legado para no marcar como rotos
      // los eventos escritos antes de canonicalizar (la cadena no estaba cableada a ninguna verificación).
      const recomputed = recordOf(canonicalJson(e.payload));
      const matchesHash =
        recomputed === e.recordHash || recordOf(JSON.stringify(e.payload)) === e.recordHash;
      if (e.previousEventHash !== expectedPrev || !matchesHash) {
        return { ok: false, checked: events.length, brokenAt: e.id };
      }
      expectedPrev = e.recordHash;
    }
    return { ok: true, checked: events.length };
  }

  async getInvoice(user: RequestUser, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { lines: true, client: { select: { id: true, name: true, taxId: true } } },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    return invoice;
  }

  /**
   * Emite una FACTURA RECTIFICATIVA que reversa por completo una factura emitida (espejo en negativo de
   * sus líneas, misma retención), como registro nuevo encadenado (Verifactu R1/S · e-CF nota de crédito
   * tipo 34). La factura original queda INMUTABLE. Mismo núcleo que la devolución de anticipos
   * (`emitInvoiceInTx` + `rectification`); aquí sin cuenta de retainer. Caso de uso principal: corregir
   * un e-CF RECHAZADO por la DGII (el motivo queda en `ecfStatusDetail`); tras emitir, la rectificativa
   * se transmite a la DGII igual que cualquier emisión (best-effort + cron de reintento).
   */
  async rectifyInvoice(user: RequestUser, id: string, dto: RectifyInvoiceDto) {
    const original = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { lines: true, rectifiedBy: { select: { id: true } } },
    });
    if (!original) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    if (original.documentType === InvoiceDocumentType.RECTIFICATIVA) {
      throw new BadRequestException(apiError('ledger.cannotRectifyRectification'));
    }
    // Solo facturas EMITIDAS fiscalmente (con registro encadenado) y no anuladas.
    if (!original.recordHash || original.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException(apiError('ledger.rectifyNotIssued'));
    }
    if (original.rectifiedBy.length > 0) {
      throw new BadRequestException(apiError('ledger.alreadyRectified'));
    }
    const matter = await this.getMatterOrThrow(user, original.matterId);
    if (!matter.tenant.taxId) throw new BadRequestException(apiError('ledger.firmNoTaxId'));
    if (!matter.client.taxId) throw new BadRequestException(apiError('clients.taxIdInvalid'));

    const issueDate = new Date().toISOString().slice(0, 10);
    // Reversa completa: espejo en negativo de cada línea (base y, vía withholdingTaxCode, la retención).
    const reversalLines = original.lines.map((l) => ({
      description: `Rectificación ${original.number}: ${l.description}`,
      quantity: l.quantity.toString(),
      unitPrice: (-Number(l.unitPrice)).toFixed(2),
      taxCode: l.taxCode,
    }));

    const { invoice, record } = await tenantTransaction(this.prisma, (tx) =>
      this.emitInvoiceInTx(tx, user, {
        matter: {
          id: matter.id,
          clientId: matter.clientId,
          tenant: {
            name: matter.tenant.name,
            taxId: matter.tenant.taxId,
            currency: original.currency,
          },
          client: { name: matter.client.name, taxId: matter.client.taxId },
        },
        lines: reversalLines,
        withholdingTaxCode: original.withholdingTaxCode ?? undefined,
        currency: original.currency,
        invoiceFormat: original.invoiceFormat as Jurisdiction,
        rectification: {
          rectifiedInvoiceId: original.id,
          rectifiedNumber: original.number,
          rectifiedIssueDate: original.issueDate.toISOString().slice(0, 10),
          reason: dto.reason,
          mode: RectificationMode.SUSTITUCION,
        },
        issueDate,
        dueDate: new Date(issueDate),
      }),
    );

    await this.audit.log(user, 'invoice.rectified', 'Invoice', invoice.id, {
      number: invoice.number,
      rectifies: original.number,
      total: record.totals.total,
      format: record.format,
    });
    // e-CF (RD): la nota de crédito también se transmite (fuera de la tx, best-effort; ver createInvoice).
    if (record.format === 'ECF') {
      const result = await this.ecfTransmission
        .transmit(user.tenantId, invoice.id)
        .catch(() => null);
      if (result) invoice.ecfStatus = result.status;
    }
    // Verifactu (ES): la rectificativa (R1) también se remite a la AEAT (ver createInvoice).
    if (record.format === 'VERIFACTU' && invoice.verifactuStatus === VerifactuStatus.PENDING) {
      const result = await this.verifactuSubmission
        .transmit(user.tenantId, invoice.id)
        .catch(() => null);
      if (result) invoice.verifactuStatus = result.status;
    }
    return { invoice, compliance: record };
  }

  /**
   * Genera el PDF (representación impresa) de una factura del despacho, acotado al tenant.
   * Reutiliza los datos fiscales ya almacenados (no recalcula); jurisdicción-aware vía el builder.
   */
  async invoicePdf(user: RequestUser, id: string): Promise<{ buffer: Buffer; number: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        lines: true,
        client: { select: { name: true, taxId: true } },
        tenant: { select: { name: true, taxId: true } },
      },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    const buffer = await buildInvoicePdf(invoiceRowToPdfData(invoice));
    return { buffer, number: invoice.number };
  }

  /**
   * Marca como cobrada por completo (atajo retro-compatible de `/ledger/invoices/:id/pay`). Delega en
   * `PaymentsService`, que registra el `Payment`, mueve `amountPaid` y refleja el cobro en el ledger.
   * Para cobros parciales o conciliación con pasarela, usar el módulo de cobros (`POST /payments`).
   */
  async payInvoice(user: RequestUser, id: string) {
    const invoice = await this.getInvoice(user, id);
    if (invoice.status === InvoiceStatus.PAID) return invoice;
    await this.payments.recordManualPayment(user, { invoiceId: id });
    return this.getInvoice(user, id);
  }

  /**
   * Listado global de facturas del despacho (acotado al tenant por RLS), para la pantalla
   * de Facturas y la vista "Vencidas". Deriva `overdue` en lectura desde `dueDate`, sin esperar
   * al scheduler de dunning. El filtro `status` casa el estado persistido; `overdue=true` filtra
   * por la derivación de vencimiento.
   */
  async listInvoices(user: RequestUser, query: ListInvoicesQueryDto) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      include: {
        client: { select: { id: true, name: true } },
        matter: { select: { id: true, reference: true } },
      },
    });
    const today = startOfTodayUtc();
    const items = rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      paidAt: r.paidAt,
      currency: r.currency,
      total: r.total.toString(),
      amountPaid: r.amountPaid.toString(),
      overdue: deriveOverdue(r.status as InvoiceStatus, r.dueDate, today),
      client: r.client,
      matter: r.matter,
    }));
    return query.overdue === 'true' ? items.filter((i) => i.overdue) : items;
  }

  // ── Aprobación de costes ─────────────────────────────────────────────────
  /** Un letrado (o admin) propone un coste (suplido). Nace PROPOSED: no afecta al saldo hasta aprobarse. */
  async proposeCost(
    user: RequestUser,
    dto: ProposeCostDto,
    receipt?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const amount = Number(dto.amount);
    if (!(amount > 0)) throw new BadRequestException(apiError('ledger.amountPositive'));
    // Valida el tipo del justificante ANTES de crear nada (solo imagen/PDF; no HTML/SVG ejecutable).
    // Comprueba el mime DECLARADO y además los MAGIC BYTES reales (no se fía del cliente).
    if (
      receipt?.buffer?.length &&
      (!isInlineSafeMime(receipt.mimetype) || !sniffSafeUploadType(receipt.buffer))
    ) {
      throw new BadRequestException(apiError('ledger.receiptType'));
    }
    const matter = await this.getMatterOrThrow(user, dto.matterId);

    const entry = await this.prisma.ledgerEntry.create({
      data: {
        tenantId: user.tenantId,
        matterId: matter.id,
        type: LedgerEntryType.DISBURSEMENT,
        description: dto.description,
        amount: dto.amount,
        currency: matter.tenant.currency,
        approvalStatus: ApprovalStatus.PROPOSED,
        proposedById: user.userId,
        approvalNote: dto.note,
      },
    });
    // Justificante opcional (foto del ticket/tasa): se guarda en el StorageProvider y se enlaza al apunte.
    if (receipt?.buffer?.length) {
      // Clave SOLO con identificadores del servidor (nunca `originalname`, que es controlable por el
      // cliente y permitiría path traversal cross-tenant). El nombre real va en `receiptName`.
      const key = `${user.tenantId}/receipts/${entry.id}/receipt`;
      await this.storage.put(key, receipt.buffer, receipt.mimetype);
      await this.prisma.ledgerEntry.update({
        where: { id: entry.id },
        data: { receiptKey: key, receiptName: receipt.originalname, receiptMime: receipt.mimetype },
      });
    }
    await this.audit.log(user, 'cost.proposed', 'LedgerEntry', entry.id, {
      matterId: matter.id,
      amount: dto.amount,
      receipt: Boolean(receipt?.buffer?.length),
    });
    // Avisa a los administradores del despacho de que hay un coste pendiente de aprobar.
    await this.notifyAdmins(user.tenantId, {
      type: 'cost.proposed',
      title: `Coste pendiente de aprobar: ${matter.reference}`,
      body: `${dto.description} · ${dto.amount}`,
      data: { ledgerEntryId: entry.id, matterId: matter.id },
    });
    return entry;
  }

  /** Lista los costes propuestos pendientes (PROPOSED) del despacho, con expediente y proponente. */
  async listApprovals(user: RequestUser) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId: user.tenantId, approvalStatus: ApprovalStatus.PROPOSED },
      orderBy: { createdAt: 'desc' },
      include: {
        matter: { select: { id: true, reference: true, title: true } },
      },
    });
    const proposerIds = [
      ...new Set(entries.map((e) => e.proposedById).filter((x): x is string => Boolean(x))),
    ];
    const proposers = proposerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: proposerIds }, tenantId: user.tenantId },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(proposers.map((p) => [p.id, p.fullName]));
    return entries.map((e) => ({
      id: e.id,
      matter: e.matter,
      description: e.description,
      amount: e.amount.toString(),
      currency: e.currency,
      note: e.approvalNote,
      proposedBy: e.proposedById ? (nameById.get(e.proposedById) ?? '—') : '—',
      createdAt: e.createdAt,
    }));
  }

  private async resolveApproval(
    user: RequestUser,
    id: string,
    status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED,
    note?: string,
  ) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!entry) throw new NotFoundException(apiError('ledger.entryNotFound'));
    if (entry.approvalStatus !== ApprovalStatus.PROPOSED) {
      throw new BadRequestException(apiError('ledger.costAlreadyResolved'));
    }
    // Segregación de funciones: quien propone un coste NO puede aprobarlo/rechazarlo él mismo (un
    // segundo par de ojos). Aplica también al APROBAR un suplido propuesto por uno mismo.
    if (status === ApprovalStatus.APPROVED && entry.proposedById === user.userId) {
      throw new BadRequestException(apiError('ledger.cannotSelfApprove'));
    }
    await this.prisma.ledgerEntry.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        approvalStatus: status,
        resolvedById: user.userId,
        approvalNote: note ?? entry.approvalNote,
      },
    });
    const action = status === ApprovalStatus.APPROVED ? 'cost.approved' : 'cost.rejected';
    await this.audit.log(user, action, 'LedgerEntry', id, { matterId: entry.matterId });
    // Notifica al proponente la resolución.
    if (entry.proposedById && entry.proposedById !== user.userId) {
      await this.notifications.create({
        tenantId: user.tenantId,
        userId: entry.proposedById,
        type: action,
        title: status === ApprovalStatus.APPROVED ? 'Coste aprobado' : 'Coste rechazado',
        body: entry.description,
        data: { ledgerEntryId: id, matterId: entry.matterId },
      });
    }
    return { id, approvalStatus: status };
  }

  approveCost(user: RequestUser, id: string, dto: ResolveApprovalDto) {
    return this.resolveApproval(user, id, ApprovalStatus.APPROVED, dto.note);
  }

  rejectCost(user: RequestUser, id: string, dto: ResolveApprovalDto) {
    return this.resolveApproval(user, id, ApprovalStatus.REJECTED, dto.note);
  }

  /** Notifica a todos los administradores ACTIVOS del despacho. */
  private async notifyAdmins(
    tenantId: string,
    params: { type: string; title: string; body?: string; data?: Record<string, unknown> },
  ) {
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        roles: { some: { role: { code: 'FIRM_ADMIN' } } },
      },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        this.notifications.create({
          tenantId,
          userId: a.id,
          type: params.type,
          title: params.title,
          body: params.body,
          data: params.data,
        }),
      ),
    );
  }
}
