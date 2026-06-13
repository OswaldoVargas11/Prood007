/**
 * SpainComplianceProvider — adaptador de cumplimiento para España (`es`).
 *
 * Cubre: NIF/CIF/NIE, IVA 21 % + retención IRPF, registro Verifactu (firma + QR + encadenamiento),
 * plazos procesales en días hábiles con festivos, LexNET y SII.
 *
 * ESTADO: esqueleto. Los métodos devuelven estructuras correctas mínimas y marcan con TODO la
 * lógica real pendiente (E9). El envío a AEAT va STUBBEADO.
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

export class SpainComplianceProvider implements ComplianceProvider {
  readonly jurisdiction = Jurisdiction.ES;

  validateTaxId(id: string): TaxIdValidationResult {
    const normalized = id.trim().toUpperCase().replace(/[\s-]/g, '');
    // TODO(E9): validar dígito de control real de NIF (letra), NIE y CIF.
    if (/^[0-9]{8}[A-Z]$/.test(normalized)) {
      return { valid: true, kind: TaxIdKind.NIF, normalized };
    }
    if (/^[XYZ][0-9]{7}[A-Z]$/.test(normalized)) {
      return { valid: true, kind: TaxIdKind.NIE, normalized };
    }
    if (/^[A-HJ-NP-SUVW][0-9]{7}[0-9A-J]$/.test(normalized)) {
      return { valid: true, kind: TaxIdKind.CIF, normalized };
    }
    return {
      valid: false,
      error: { code: 'INVALID_TAX_ID', messageKey: 'compliance.es.taxId.invalid' },
    };
  }

  getTaxRates(): TaxRatesResult {
    return {
      jurisdiction: Jurisdiction.ES,
      rates: [
        { code: 'IVA_STANDARD', labelKey: 'tax.es.iva', ratePercent: '21', withholding: false },
        { code: 'IVA_REDUCED', labelKey: 'tax.es.ivaReduced', ratePercent: '10', withholding: false },
        // Retención IRPF profesional: 15 % régimen general, 7 % primeros años.
        { code: 'IRPF_GENERAL', labelKey: 'tax.es.irpf', ratePercent: '15', withholding: true },
        { code: 'IRPF_REDUCED', labelKey: 'tax.es.irpfReduced', ratePercent: '7', withholding: true },
      ],
    };
  }

  async buildInvoiceRecord(invoice: InvoiceInput): Promise<InvoiceRecord> {
    // TODO(E5/E9): cálculo real de totales por línea con su taxCode + firma + huella Verifactu.
    return {
      jurisdiction: Jurisdiction.ES,
      format: 'VERIFACTU',
      totals: { taxableBase: '0', taxAmount: '0', withholdingAmount: '0', total: '0' },
      payload: {
        // Estructura representativa del registro de alta Verifactu (a completar en E9).
        idFactura: invoice.invoiceNumber,
        fechaExpedicion: invoice.issueDate,
        encadenamiento: { huellaAnterior: invoice.previousRecordHash ?? null },
        // qrUrl, huella, firma → pendientes (E9).
        qrUrl: null,
        huella: null,
      },
      recordHash: undefined, // TODO(E9): SHA-256 del registro canónico para encadenar.
      submission: { status: 'STUBBED', detail: 'Envío a AEAT no implementado en MVP.' },
    };
  }

  getProceduralDeadlines(params: ProceduralDeadlineParams): ProceduralDeadlineResult {
    // TODO(E9): cómputo real en días hábiles con festivos nacionales/autonómicos.
    return {
      deadlineType: params.deadlineType,
      startDate: params.startDate,
      dueDate: params.startDate, // placeholder
      businessDays: true,
      holidaysApplied: [],
      notes: ['Cálculo de festivos pendiente (E9).'],
    };
  }

  getCourtIntegration(): CourtIntegration {
    // Stub del modelo LexNET (notificaciones/acuses/escritos) — sin conexión real en MVP.
    return {
      available: true,
      system: 'LEXNET',
      async listNotifications() {
        return [];
      },
      async acknowledge(notificationId: string) {
        return { notificationId, acknowledgedAt: new Date().toISOString() };
      },
      async submitFiling(filing) {
        return {
          filingId: `stub-${Date.now()}`,
          acceptedAt: new Date().toISOString(),
          status: 'ACCEPTED' as const,
        };
      },
    };
  }

  getFiscalReports(): FiscalReports {
    return {
      supported: ['SII'],
      async generate(reportCode, params) {
        // TODO(E9): construir el suministro SII real.
        return {
          reportCode,
          period: params.period,
          format: 'XML',
          content: `<SII period="${params.period}"><!-- stub --></SII>`,
          submission: { status: 'STUBBED', detail: 'Suministro a AEAT no implementado en MVP.' },
        };
      },
    };
  }
}
