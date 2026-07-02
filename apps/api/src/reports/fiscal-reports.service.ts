import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Jurisdiction } from '@legalflow/domain';
import { round2 } from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { buildFiscalReportPdf } from './fiscal-report-pdf';
import { buildXlsx, type XlsxSheet } from './xlsx-lite';
import type { RequestUser } from '../auth/auth.types';

/**
 * Informe fiscal por periodo (solo lectura; precursor del modelo 303 ES y de las declaraciones DGII).
 *
 * Agrega las facturas EMITIDAS del periodo (mes / trimestre / año) y devuelve, POR FORMATO FISCAL de la
 * factura (es = Verifactu · do = e-CF) y acotado por tenant (RLS):
 *  - base imponible + impuesto repercutido (IVA/ITBIS) DESGLOSADO POR TIPO (21/10/4 · 18 %);
 *  - retención de IRPF practicada, desglosada por tipo;
 *  - desglose por SERIE de facturación (base, cuota, retención, total);
 *  - totales del bloque.
 *
 * Núcleo AGNÓSTICO: las etiquetas y los tipos impositivos los aporta el `ComplianceProvider` de la
 * jurisdicción (getTaxRates). Las rectificativas RESTAN de forma natural: se emiten con líneas/importes
 * negativos, así que su contribución a bases y cuotas ya viene con signo negativo.
 *
 * No es una presentación telemática oficial: son los datos agregados que el despacho pasa a su asesor.
 */

// Facturas que cuentan como emitidas (todo menos borrador y anulada).
const ISSUED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIAL,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PAID,
];

export interface FiscalReportQuery {
  year: number;
  /** 1-12 → un solo mes. Tiene prioridad sobre `quarter`. */
  month?: number;
  /** 1-4 → un trimestre natural. */
  quarter?: number;
}

export interface TaxTypeRow {
  code: string;
  labelKey: string;
  ratePercent: string;
  base: number;
  tax: number;
  invoices: number;
}
export interface WithholdingRow {
  code: string;
  labelKey: string;
  ratePercent: string;
  base: number;
  amount: number;
  invoices: number;
}
export interface SeriesRow {
  series: string;
  invoices: number;
  base: number;
  tax: number;
  withholding: number;
  total: number;
}
export interface FiscalReportBlock {
  /** Formato fiscal de la factura: es | do. */
  format: string;
  /** Formato del registro fiscal del provider: VERIFACTU | ECF. */
  recordFormat: string;
  currency: string;
  outputTax: TaxTypeRow[];
  withholding: WithholdingRow[];
  bySeries: SeriesRow[];
  totals: { base: number; tax: number; withholding: number; total: number; invoices: number };
}
export interface FiscalReportPeriod {
  year: number;
  month: number | null;
  quarter: number | null;
  /** Etiqueta legible del periodo (p. ej. "2026", "T2 2026", "2026-04"). */
  label: string;
  /** Rango [start, end) en ISO yyyy-mm-dd (end exclusivo). */
  start: string;
  end: string;
}
export interface FiscalReport {
  period: FiscalReportPeriod;
  blocks: FiscalReportBlock[];
  /** El desglose por tipo se recalcula con los tipos VIGENTES del provider (las líneas guardan el código,
   *  no el tipo). Con tipos estables coincide exactamente con la cuota almacenada de cada factura. */
  note: string;
}

/** Deriva la SERIE de facturación del número: eNCF → `E31`/`E34`; serie interna `FAC-2026-0001` → `FAC`. */
export function deriveSeries(number: string): string {
  const encf = /^(E\d{2})\d{8,}$/.exec(number);
  if (encf) return encf[1] ?? number;
  const internal = /^(.+)-\d{4}-\d+$/.exec(number);
  if (internal) return internal[1] ?? number;
  return number;
}

/** Calcula el rango [start, end) (UTC) y su etiqueta a partir de año + (mes | trimestre | año completo). */
export function resolvePeriod(query: FiscalReportQuery): FiscalReportPeriod {
  const { year } = query;
  const month = query.month && query.month >= 1 && query.month <= 12 ? query.month : undefined;
  const quarter =
    query.quarter && query.quarter >= 1 && query.quarter <= 4 ? query.quarter : undefined;

  let startMonth = 0;
  let months = 12;
  let label = String(year);
  if (month) {
    startMonth = month - 1;
    months = 1;
    label = `${year}-${String(month).padStart(2, '0')}`;
  } else if (quarter) {
    startMonth = (quarter - 1) * 3;
    months = 3;
    label = `T${quarter} ${year}`;
  }
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + months, 1));
  return {
    year,
    month: month ?? null,
    quarter: month ? null : (quarter ?? null),
    label,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

interface BlockAcc {
  format: string;
  currency: string;
  outputTax: Map<string, { base: number; tax: number; invoices: Set<string> }>;
  withholdingByCode: Map<string, { base: number; amount: number; invoices: Set<string> }>;
  bySeries: Map<
    string,
    { invoices: number; base: number; tax: number; withholding: number; total: number }
  >;
  base: number;
  tax: number;
  withholding: number;
  total: number;
  invoices: number;
}

@Injectable()
export class FiscalReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  async periodReport(user: RequestUser, query: FiscalReportQuery): Promise<FiscalReport> {
    const period = resolvePeriod(query);

    // RLS: TODA la lectura acotada por tenant. Solo facturas emitidas dentro del periodo.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: ISSUED_STATUSES },
        issueDate: { gte: new Date(period.start), lt: new Date(period.end) },
      },
      select: {
        id: true,
        number: true,
        invoiceFormat: true,
        currency: true,
        taxableBase: true,
        taxAmount: true,
        withholdingAmount: true,
        withholdingTaxCode: true,
        total: true,
        lines: { select: { quantity: true, unitPrice: true, taxCode: true } },
      },
      orderBy: { issueDate: 'asc' },
    });

    const blocks = new Map<string, BlockAcc>();
    // Cache de tipos por formato (código → tasa) para etiquetar/valorar los conceptos vía el provider.
    const ratesByFormat = new Map<
      string,
      {
        map: Map<string, { labelKey: string; ratePercent: string; withholding: boolean }>;
        recordFormat: string;
      }
    >();
    const ratesFor = (format: string) => {
      let cached = ratesByFormat.get(format);
      if (!cached) {
        const provider = this.compliance.forJurisdiction(format as Jurisdiction);
        const map = new Map(
          provider
            .getTaxRates()
            .rates.map((r) => [
              r.code,
              { labelKey: r.labelKey, ratePercent: r.ratePercent, withholding: r.withholding },
            ]),
        );
        cached = { map, recordFormat: provider.invoiceFormat };
        ratesByFormat.set(format, cached);
      }
      return cached;
    };

    for (const inv of invoices) {
      const format = inv.invoiceFormat;
      const rates = ratesFor(format);
      let block = blocks.get(format);
      if (!block) {
        block = {
          format,
          currency: inv.currency,
          outputTax: new Map(),
          withholdingByCode: new Map(),
          bySeries: new Map(),
          base: 0,
          tax: 0,
          withholding: 0,
          total: 0,
          invoices: 0,
        };
        blocks.set(format, block);
      }

      // Totales del bloque desde los importes ALMACENADOS de la factura (autoridad: cuadran con la factura).
      const invBase = Number(inv.taxableBase);
      const invTax = Number(inv.taxAmount);
      const invWithheld = Number(inv.withholdingAmount);
      const invTotal = Number(inv.total);
      block.base += invBase;
      block.tax += invTax;
      block.withholding += invWithheld;
      block.total += invTotal;
      block.invoices += 1;

      // Desglose por SERIE (desde los importes almacenados → cuadra con el total del bloque).
      const series = deriveSeries(inv.number);
      const s = block.bySeries.get(series) ?? {
        invoices: 0,
        base: 0,
        tax: 0,
        withholding: 0,
        total: 0,
      };
      s.invoices += 1;
      s.base += invBase;
      s.tax += invTax;
      s.withholding += invWithheld;
      s.total += invTotal;
      block.bySeries.set(series, s);

      // Desglose del impuesto repercutido POR TIPO (recalculado por línea: base × tipo del código).
      for (const line of inv.lines) {
        const rate = rates.map.get(line.taxCode);
        const ratePercent = rate ? Number(rate.ratePercent) : 0;
        const base = round2(Number(line.quantity) * Number(line.unitPrice));
        const tax = round2((base * ratePercent) / 100);
        const row = block.outputTax.get(line.taxCode) ?? { base: 0, tax: 0, invoices: new Set() };
        row.base += base;
        row.tax += tax;
        row.invoices.add(inv.id);
        block.outputTax.set(line.taxCode, row);
      }

      // Retención IRPF por tipo (desde el importe almacenado; la base de retención es la base imponible).
      if (inv.withholdingTaxCode && invWithheld !== 0) {
        const w = block.withholdingByCode.get(inv.withholdingTaxCode) ?? {
          base: 0,
          amount: 0,
          invoices: new Set<string>(),
        };
        w.base += invBase;
        w.amount += invWithheld;
        w.invoices.add(inv.id);
        block.withholdingByCode.set(inv.withholdingTaxCode, w);
      }
    }

    const result: FiscalReportBlock[] = [...blocks.values()]
      .map((b) => {
        const rates = ratesFor(b.format);
        const outputTax: TaxTypeRow[] = [...b.outputTax.entries()]
          .map(([code, v]) => {
            const rate = rates.map.get(code);
            return {
              code,
              labelKey: rate?.labelKey ?? code,
              ratePercent: rate?.ratePercent ?? '0',
              base: round2(v.base),
              tax: round2(v.tax),
              invoices: v.invoices.size,
            };
          })
          .sort((x, y) => Number(y.ratePercent) - Number(x.ratePercent));
        const withholding: WithholdingRow[] = [...b.withholdingByCode.entries()]
          .map(([code, v]) => {
            const rate = rates.map.get(code);
            return {
              code,
              labelKey: rate?.labelKey ?? code,
              ratePercent: rate?.ratePercent ?? '0',
              base: round2(v.base),
              amount: round2(v.amount),
              invoices: v.invoices.size,
            };
          })
          .sort((x, y) => Number(y.ratePercent) - Number(x.ratePercent));
        const bySeries: SeriesRow[] = [...b.bySeries.entries()]
          .map(([series, v]) => ({
            series,
            invoices: v.invoices,
            base: round2(v.base),
            tax: round2(v.tax),
            withholding: round2(v.withholding),
            total: round2(v.total),
          }))
          .sort((x, y) => x.series.localeCompare(y.series));
        return {
          format: b.format,
          recordFormat: rates.recordFormat,
          currency: b.currency,
          outputTax,
          withholding,
          bySeries,
          totals: {
            base: round2(b.base),
            tax: round2(b.tax),
            withholding: round2(b.withholding),
            total: round2(b.total),
            invoices: b.invoices,
          },
        };
      })
      .sort((a, b) => a.format.localeCompare(b.format));

    return {
      period,
      blocks: result,
      note: 'Desglose por tipo recalculado con los tipos impositivos vigentes; los totales provienen de los importes de cada factura.',
    };
  }

  /** Nombre de archivo estable para las descargas (sin espacios). */
  private fileSlug(period: FiscalReportPeriod): string {
    return `informe-fiscal-${period.label.replace(/\s+/g, '-')}`;
  }

  /** Informe fiscal del periodo en PDF (representación impresa para el asesor). */
  async periodPdf(
    user: RequestUser,
    query: FiscalReportQuery,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [report, tenant] = await Promise.all([
      this.periodReport(user, query),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { name: true, taxId: true },
      }),
    ]);
    const buffer = await buildFiscalReportPdf({
      firmName: tenant.name,
      firmTaxId: tenant.taxId,
      report,
    });
    return { buffer, filename: `${this.fileSlug(report.period)}.pdf` };
  }

  /** Informe fiscal del periodo en Excel (una hoja por formato fiscal; importes como números). */
  async periodXlsx(
    user: RequestUser,
    query: FiscalReportQuery,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const report = await this.periodReport(user, query);
    const sheets: XlsxSheet[] = report.blocks.map((b) => {
      const rows: XlsxSheet['rows'] = [
        ['Informe fiscal', report.period.label],
        ['Formato', b.format, b.recordFormat, b.currency],
        [],
        ['Impuesto repercutido por tipo'],
        ['Código', 'Tipo %', 'Facturas', 'Base', 'Cuota'],
        ...b.outputTax.map((r) => [r.code, r.ratePercent, r.invoices, r.base, r.tax]),
        [],
      ];
      if (b.withholding.length > 0) {
        rows.push(['Retención IRPF por tipo']);
        rows.push(['Código', 'Tipo %', 'Facturas', 'Base', 'Retención']);
        for (const r of b.withholding)
          rows.push([r.code, r.ratePercent, r.invoices, r.base, r.amount]);
        rows.push([]);
      }
      rows.push(['Por serie de facturación']);
      rows.push(['Serie', 'Facturas', 'Base', 'Impuesto', 'Retención', 'Total']);
      for (const s of b.bySeries)
        rows.push([s.series, s.invoices, s.base, s.tax, s.withholding, s.total]);
      rows.push([]);
      rows.push([
        'Totales',
        b.totals.invoices,
        b.totals.base,
        b.totals.tax,
        b.totals.withholding,
        b.totals.total,
      ]);
      return { name: b.format === 'es' ? 'España' : b.format === 'do' ? 'RD' : b.format, rows };
    });
    if (sheets.length === 0)
      sheets.push({ name: 'Informe', rows: [['Sin facturas en el periodo']] });
    const buffer = await buildXlsx(sheets);
    return { buffer, filename: `${this.fileSlug(report.period)}.xlsx` };
  }
}
