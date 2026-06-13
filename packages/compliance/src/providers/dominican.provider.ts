/**
 * DominicanComplianceProvider — adaptador de cumplimiento para República Dominicana (`do`).
 *
 * Cubre: RNC/Cédula, ITBIS 18 %, e-CF (Comprobante Fiscal Electrónico — Ley 32-23 / DGII) como
 * XML firmable, reportes 606 (compras) / 607 (ventas). Calendario judicial menos desarrollado:
 * la interfaz de plazos queda lista pero advierte. LexNET no aplica (no disponible).
 *
 * ESTADO: esqueleto. Envío a DGII STUBBEADO.
 */
import { createHash } from 'node:crypto';
import { Jurisdiction, TaxIdKind } from '@legalflow/domain';
import { addBusinessDays } from '../deadlines';
import { computeInvoiceTotals } from '../tax-math';
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
    const normalized = id.trim().replace(/[\s-]/g, '');
    // RNC: 9 dígitos. Cédula: 11 dígitos. TODO(E9): validar dígito verificador real de cada uno.
    if (/^[0-9]{9}$/.test(normalized)) {
      return { valid: true, kind: TaxIdKind.RNC, normalized };
    }
    if (/^[0-9]{11}$/.test(normalized)) {
      return { valid: true, kind: TaxIdKind.CEDULA, normalized };
    }
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
    // En RD no hay retención de IRPF; solo ITBIS repercutido.
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
      '  <!-- Firma con certificado digital → fase de integración (fuera de MVP) -->',
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
        detail: 'Validación en tiempo real con DGII no implementada en MVP.',
      },
    };
  }

  getProceduralDeadlines(params: ProceduralDeadlineParams): ProceduralDeadlineResult {
    // Se excluyen fines de semana; el calendario de festivos judiciales de RD no está consolidado.
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
    // En RD no hay equivalente a LexNET integrable en el MVP → no disponible, de forma limpia.
    return { available: false };
  }

  getFiscalReports(): FiscalReports {
    return {
      supported: ['606', '607'],
      async generate(reportCode, params) {
        // TODO(E9): construir formatos 606 (compras) / 607 (ventas) reales de la DGII.
        return {
          reportCode,
          period: params.period,
          format: 'CSV',
          content: `# Reporte ${reportCode} ${params.period} (stub)`,
          submission: { status: 'STUBBED', detail: 'Envío a DGII no implementado en MVP.' },
        };
      },
    };
  }
}
