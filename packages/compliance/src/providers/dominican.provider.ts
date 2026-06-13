/**
 * DominicanComplianceProvider — adaptador de cumplimiento para República Dominicana (`do`).
 *
 * Cubre: RNC/Cédula, ITBIS 18 %, e-CF (Comprobante Fiscal Electrónico — Ley 32-23 / DGII) como
 * XML firmable, reportes 606 (compras) / 607 (ventas). Calendario judicial menos desarrollado:
 * la interfaz de plazos queda lista pero advierte. LexNET no aplica (no disponible).
 *
 * ESTADO: esqueleto. Envío a DGII STUBBEADO.
 */
import { Jurisdiction, TaxIdKind } from '@legalflow/domain';
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
    // TODO(E5/E9): totales reales por línea + e-CF XML conforme al estándar DGII, listo para firma.
    const ecfXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ECF>', // estructura representativa (a completar en E9 con el esquema DGII real)
      '  <Encabezado>',
      `    <NumeroComprobante>${invoice.invoiceNumber}</NumeroComprobante>`,
      `    <FechaEmision>${invoice.issueDate}</FechaEmision>`,
      `    <RNCEmisor>${invoice.seller.taxId}</RNCEmisor>`,
      `    <RNCComprador>${invoice.buyer.taxId}</RNCComprador>`,
      '  </Encabezado>',
      '  <!-- Detalle, totales ITBIS y firma con certificado pendientes (E9) -->',
      '</ECF>',
    ].join('\n');

    return {
      jurisdiction: Jurisdiction.DO,
      format: 'ECF',
      totals: { taxableBase: '0', taxAmount: '0', withholdingAmount: '0', total: '0' },
      payload: { ecfXml },
      recordHash: undefined,
      submission: { status: 'STUBBED', detail: 'Validación en tiempo real con DGII no implementada en MVP.' },
    };
  }

  getProceduralDeadlines(params: ProceduralDeadlineParams): ProceduralDeadlineResult {
    return {
      deadlineType: params.deadlineType,
      startDate: params.startDate,
      dueDate: params.startDate, // placeholder
      businessDays: true,
      holidaysApplied: [],
      notes: ['Calendario judicial de RD no consolidado; cálculo aproximado (E9).'],
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
