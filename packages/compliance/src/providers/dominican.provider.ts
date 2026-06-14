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
  InvoiceRecord,
  ProceduralDeadlineParams,
  ProceduralDeadlineResult,
  TaxIdValidationResult,
  TaxRatesResult,
} from '../types';

export class DominicanComplianceProvider implements ComplianceProvider {
  readonly jurisdiction = Jurisdiction.DO;

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

  async buildInvoiceRecord(invoice: InvoiceInput): Promise<InvoiceRecord> {
    const { rates } = this.getTaxRates();
    const { totals } = computeInvoiceTotals(invoice.lines, rates);

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
      '  </Encabezado>',
      '  <!-- Digital certificate signature is outside the MVP integration scope. -->',
      '</ECF>',
    ].join('\n');

    const recordHash = createHash('sha256').update(ecfXml).digest('hex');

    return {
      jurisdiction: Jurisdiction.DO,
      format: 'ECF',
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
    const { dueDate, holidaysApplied } = addBusinessDays(
      new Date(params.startDate),
      params.days,
      () => false,
    );
    return {
      deadlineType: params.deadlineType,
      startDate: params.startDate,
      dueDate,
      businessDays: true,
      holidaysApplied,
      notes: ['Solo se excluyen fines de semana; festivos judiciales RD pendientes (E9).'],
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
