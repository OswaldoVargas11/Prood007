/**
 * SpainComplianceProvider — adaptador de cumplimiento para España (`es`).
 *
 * Cubre: NIF/CIF/NIE, IVA 21 % + retención IRPF, registro Verifactu (firma + QR + encadenamiento),
 * plazos procesales en días hábiles con festivos, LexNET y SII.
 *
 * ESTADO: esqueleto. Los métodos devuelven estructuras correctas mínimas y marcan con TODO la
 * lógica real pendiente (E9). El envío a AEAT va STUBBEADO.
 */
import { createHash } from 'node:crypto';
import { Jurisdiction } from '@legalflow/domain';
import { addBusinessDays, spanishNationalHolidays } from '../deadlines';
import { computeInvoiceTotals } from '../tax-math';
import { validateEsTaxId } from '../taxid';
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

export class SpainComplianceProvider implements ComplianceProvider {
  readonly jurisdiction = Jurisdiction.ES;
  readonly invoiceFormat = 'VERIFACTU';

  validateTaxId(id: string): TaxIdValidationResult {
    const result = validateEsTaxId(id);
    if (result.valid) return result;
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
        {
          code: 'IVA_REDUCED',
          labelKey: 'tax.es.ivaReduced',
          ratePercent: '10',
          withholding: false,
        },
        // Retención IRPF profesional: 15 % régimen general, 7 % primeros años.
        { code: 'IRPF_GENERAL', labelKey: 'tax.es.irpf', ratePercent: '15', withholding: true },
        {
          code: 'IRPF_REDUCED',
          labelKey: 'tax.es.irpfReduced',
          ratePercent: '7',
          withholding: true,
        },
      ],
    };
  }

  previewInvoice(lines: InvoiceLineInput[], withholdingTaxCode?: string): InvoicePreview {
    const { rates } = this.getTaxRates();
    const { totals } = computeInvoiceTotals(lines, rates, withholdingTaxCode);
    return { jurisdiction: this.jurisdiction, format: this.invoiceFormat, totals };
  }

  async buildInvoiceRecord(invoice: InvoiceInput): Promise<InvoiceRecord> {
    // Misma ruta de cálculo que el preview en vivo: fuente única de la matemática fiscal.
    const { totals } = this.previewInvoice(invoice.lines, invoice.withholdingTaxCode);

    // Encadenamiento Verifactu: huella = SHA-256 de campos canónicos + huella del registro anterior.
    const canonical = [
      invoice.seller.taxId,
      invoice.invoiceNumber,
      invoice.issueDate,
      totals.total,
      invoice.previousRecordHash ?? '',
    ].join('|');
    const recordHash = createHash('sha256').update(canonical).digest('hex');

    // URL de validación con QR (estructura representativa del servicio de la AEAT).
    const qrUrl =
      'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?' +
      `nif=${encodeURIComponent(invoice.seller.taxId)}` +
      `&numserie=${encodeURIComponent(invoice.invoiceNumber)}` +
      `&fecha=${encodeURIComponent(invoice.issueDate)}` +
      `&importe=${encodeURIComponent(totals.total)}`;

    return {
      jurisdiction: Jurisdiction.ES,
      format: this.invoiceFormat,
      totals,
      payload: {
        idFactura: invoice.invoiceNumber,
        fechaExpedicion: invoice.issueDate,
        emisor: invoice.seller.taxId,
        receptor: invoice.buyer.taxId,
        importeTotal: totals.total,
        tipoHuella: '01', // SHA-256
        huella: recordHash,
        encadenamiento: { huellaAnterior: invoice.previousRecordHash ?? null },
        qrUrl,
        // Firma con certificado real → fase de integración (fuera de MVP).
      },
      recordHash,
      submission: { status: 'STUBBED', detail: 'Envío a AEAT no implementado en MVP.' },
    };
  }

  getProceduralDeadlines(params: ProceduralDeadlineParams): ProceduralDeadlineResult {
    const start = new Date(params.startDate);
    const cache = new Map<number, Set<string>>();
    const local = new Set(params.extraHolidays ?? []);
    const isHoliday = (date: Date): boolean => {
      const iso = date.toISOString().slice(0, 10);
      if (local.has(iso)) return true;
      const year = date.getUTCFullYear();
      if (!cache.has(year)) cache.set(year, spanishNationalHolidays(year));
      return cache.get(year)!.has(iso);
    };
    const { dueDate, holidaysApplied } = addBusinessDays(start, params.days, isHoliday);
    return {
      deadlineType: params.deadlineType,
      startDate: params.startDate,
      dueDate,
      businessDays: true,
      holidaysApplied,
      notes: [
        local.size > 0
          ? 'Festivos nacionales + festivos locales del despacho aplicados.'
          : 'Festivos nacionales aplicados; añade festivos locales en Ajustes.',
      ],
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
      async submitFiling(_filing) {
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
