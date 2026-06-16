/**
 * DominicanComplianceProvider - compliance adapter for Dominican Republic (`do`).
 *
 * Covers RNC/Cedula validation, ITBIS 18%, e-CF XML payloads, 606/607 reports and a clean
 * "not available" court integration because LexNET does not apply in this jurisdiction.
 */
import { createHash } from 'node:crypto';
import { Jurisdiction } from '@legalflow/domain';
import { addBusinessDays } from '../deadlines';
import { computeInvoiceTotals } from '../tax-math';
import { validateDoTaxId } from '../taxid';
import type { ComplianceProvider } from '../provider.interface';
import type {
  CourtIntegration,
  FiscalReports,
  InvoiceInput,
  InvoiceLineInput,
  InvoicePreview,
  InvoiceRecord,
  ProceduralDeadlineParams,
  ProceduralDeadlineResult,
  TaxIdValidationResult,
  TaxRatesResult,
} from '../types';

export class DominicanComplianceProvider implements ComplianceProvider {
  readonly jurisdiction = Jurisdiction.DO;
  readonly invoiceFormat = 'ECF';

  validateTaxId(id: string): TaxIdValidationResult {
    const result = validateDoTaxId(id);
    if (result.valid) return result;
    return {
      valid: false,
      error: { code: 'INVALID_TAX_ID', messageKey: 'compliance.do.taxId.invalid' },
    };
  }

  getTaxRates(): TaxRatesResult {
    return {
      jurisdiction: Jurisdiction.DO,
      rates: [
        { code: 'ITBIS_STANDARD', labelKey: 'tax.do.itbis', ratePercent: '18', withholding: false },
      ],
    };
  }

  previewInvoice(lines: InvoiceLineInput[], withholdingTaxCode?: string): InvoicePreview {
    // En RD no hay retención: si llega un withholdingTaxCode, computeInvoiceTotals lo rechaza.
    const { rates } = this.getTaxRates();
    const { totals } = computeInvoiceTotals(lines, rates, withholdingTaxCode);
    return { jurisdiction: this.jurisdiction, format: this.invoiceFormat, totals };
  }

  async buildInvoiceRecord(invoice: InvoiceInput): Promise<InvoiceRecord> {
    // Misma ruta de cálculo que el preview en vivo: fuente única de la matemática fiscal.
    const { totals } = this.previewInvoice(invoice.lines, invoice.withholdingTaxCode);

    // Anticipos deducidos en el e-CF final (D-027 (b)): deducción de las facturas de anticipo ya
    // emitidas (NO una nota de crédito). El ITBIS acumulado = ITBIS del total, sin doble imposición; las
    // facturas de anticipo quedan inmutables. Conservador: la deducción en el e-CF final está menos
    // cerrada en las fuentes RD que la nota de crédito; un contador dominicano lo afinaría (D-027).
    const anticiposBlock =
      invoice.deductedAdvances && invoice.deductedAdvances.length > 0
        ? [
            '    <AnticiposDeducidos>',
            ...invoice.deductedAdvances.flatMap((a) => [
              '      <Anticipo>',
              `        <eNCFAnticipo>${a.invoiceNumber}</eNCFAnticipo>`,
              `        <MontoGravadoDeducido>${a.base}</MontoGravadoDeducido>`,
              '      </Anticipo>',
            ]),
            '    </AnticiposDeducidos>',
          ]
        : [];

    const ecfXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ECF>',
      '  <Encabezado>',
      '    <IdDoc>',
      `      <eNCF>${invoice.invoiceNumber}</eNCF>`,
      `      <FechaEmision>${invoice.issueDate}</FechaEmision>`,
      '    </IdDoc>',
      '    <Emisor>',
      `      <RNCEmisor>${invoice.seller.taxId}</RNCEmisor>`,
      '    </Emisor>',
      '    <Comprador>',
      `      <RNCComprador>${invoice.buyer.taxId}</RNCComprador>`,
      '    </Comprador>',
      '    <Totales>',
      `      <MontoGravadoTotal>${totals.taxableBase}</MontoGravadoTotal>`,
      `      <TotalITBIS>${totals.taxAmount}</TotalITBIS>`,
      `      <MontoTotal>${totals.total}</MontoTotal>`,
      '    </Totales>',
      ...anticiposBlock,
      '  </Encabezado>',
      '  <!-- Digital certificate signature is outside the MVP integration scope. -->',
      '</ECF>',
    ].join('\n');

    const recordHash = createHash('sha256').update(ecfXml).digest('hex');

    return {
      jurisdiction: Jurisdiction.DO,
      format: this.invoiceFormat,
      totals,
      payload: { ecfXml },
      recordHash,
      submission: {
        status: 'STUBBED',
        detail: 'Validacion en tiempo real con DGII no implementada en MVP.',
      },
    };
  }

  getProceduralDeadlines(params: ProceduralDeadlineParams): ProceduralDeadlineResult {
    const local = new Set(params.extraHolidays ?? []);
    const { dueDate, holidaysApplied } = addBusinessDays(
      new Date(params.startDate),
      params.days,
      (date) => local.has(date.toISOString().slice(0, 10)),
    );
    return {
      deadlineType: params.deadlineType,
      startDate: params.startDate,
      dueDate,
      businessDays: true,
      holidaysApplied,
      notes: [
        local.size > 0
          ? 'Fines de semana + festivos locales del despacho aplicados.'
          : 'Solo se excluyen fines de semana; añade festivos locales en Ajustes.',
      ],
    };
  }

  getCourtIntegration(): CourtIntegration {
    return { available: false };
  }

  getFiscalReports(): FiscalReports {
    return {
      supported: ['606', '607'],
      async generate(reportCode, params) {
        return {
          reportCode,
          period: params.period,
          format: 'CSV',
          content: `# Reporte ${reportCode} ${params.period} (stub)`,
          submission: { status: 'STUBBED', detail: 'Envio a DGII no implementado en MVP.' },
        };
      },
    };
  }
}
