/**
 * ComplianceProvider — frontera entre el núcleo agnóstico y lo específico de cada jurisdicción.
 *
 * REGLA DE ORO: ninguna ley, impuesto, formato fiscal o integración de organismo de un país
 * concreto debe filtrarse fuera de una implementación de esta interfaz. El núcleo solo conoce
 * `ComplianceProvider`; obtiene la implementación correcta vía `ComplianceProviderFactory`
 * según `tenant.jurisdiction`.
 */
import type { Jurisdiction, TaxIdKind } from '@legalflow/domain';
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
} from './types';

export interface ComplianceProvider {
  /** Jurisdicción que implementa este provider. */
  readonly jurisdiction: Jurisdiction;

  /** Formato del registro fiscal de la jurisdicción: "VERIFACTU" (ES) | "ECF" (RD). */
  readonly invoiceFormat: string;

  /**
   * Valida un documento de cliente. Por defecto valida el identificador FISCAL de la jurisdicción
   * (NIF/CIF/NIE en ES · RNC/Cédula en RD) con su dígito/letra de control. Si `declaredKind` es
   * PASSPORT u OTHER, aplica validación ligera (formato, sin dígito de control) para admitir
   * clientes extranjeros o sin identificador fiscal local.
   */
  validateTaxId(id: string, declaredKind?: TaxIdKind): TaxIdValidationResult;

  /** Tasas impositivas vigentes: IVA + retención IRPF (ES); ITBIS (RD). */
  getTaxRates(): TaxRatesResult;

  /**
   * Pre-cálculo READ-ONLY de los totales de una factura, sin emitirla ni cambiar estado.
   * DEBE reutilizar la MISMA matemática fiscal que `buildInvoiceRecord` (no se duplica la lógica):
   * preview y factura emitida nunca pueden divergir. Alimenta el preview fiscal en vivo de la UI.
   */
  previewInvoice(lines: InvoiceLineInput[], withholdingTaxCode?: string): InvoicePreview;

  /**
   * Genera el registro fiscal estructuralmente correcto de la factura:
   *  - ES: registro Verifactu (firma + QR + encadenamiento por hash).
   *  - RD: e-CF (XML conforme al estándar DGII, listo para firma con certificado).
   * El envío real a AEAT/DGII va STUBBEADO, pero el documento generado debe ser correcto.
   */
  buildInvoiceRecord(invoice: InvoiceInput): Promise<InvoiceRecord>;

  /**
   * Calcula plazos procesales en días hábiles con festivos.
   * Implementación real para ES; en RD la interfaz queda lista aunque el calendario judicial
   * esté menos desarrollado (devuelve notas de advertencia).
   */
  getProceduralDeadlines(params: ProceduralDeadlineParams): ProceduralDeadlineResult;

  /** Integración con notificaciones judiciales: LexNET (ES); "no disponible" en RD. */
  getCourtIntegration(): CourtIntegration;

  /** Informes fiscales: SII (ES); reportes 606/607 (RD). */
  getFiscalReports(): FiscalReports;
}

/** Token de inyección (Nest) para resolver el provider del tenant en curso. */
export const COMPLIANCE_PROVIDER = Symbol('COMPLIANCE_PROVIDER');
