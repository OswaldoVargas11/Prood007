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
import { Jurisdiction, TaxIdKind } from '@legalflow/domain';
import { addBusinessDays, spanishNationalHolidays } from '../deadlines';
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
    const { rates } = this.getTaxRates();
    const { totals } = computeInvoiceTotals(invoice.lines, rates, invoice.withholdingTaxCode);

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
      format: 'VERIFACTU',
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
    const isHoliday = (date: Date): boolean => {
      const year = date.getUTCFullYear();
      if (!cache.has(year)) cache.set(year, spanishNationalHolidays(year));
      return cache.get(year)!.has(date.toISOString().slice(0, 10));
    };
    const { dueDate, holidaysApplied } = addBusinessDays(start, params.days, isHoliday);
    return {
      deadlineType: params.deadlineType,
      startDate: params.startDate,
      dueDate,
      businessDays: true,
      holidaysApplied,
      // Solo festivos nacionales; autonómicos/locales pendientes (E9).
      notes: ['Festivos nacionales aplicados; faltan autonómicos y locales (E9).'],
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
