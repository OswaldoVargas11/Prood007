/**
 * Tipos de la capa de cumplimiento.
 *
 * Estos tipos describen la FRONTERA entre el núcleo agnóstico y los adaptadores por país.
 * El núcleo construye entradas neutrales (importes, identificadores, fechas) y recibe de vuelta
 * estructuras que NO interpreta semánticamente (p. ej. el JSON del registro Verifactu o el XML
 * e-CF). Así, añadir un país nuevo no obliga a tocar el núcleo.
 */
import type { Jurisdiction, TaxIdKind } from '@legalflow/domain';

// ─────────────────────────────────────────────────────────────────────────────
// validateTaxId
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxIdValidationResult {
  valid: boolean;
  /** Tipo detectado del identificador (NIF/CIF/NIE en ES; RNC/Cédula en RD). */
  kind?: TaxIdKind;
  /** Forma normalizada (sin guiones/espacios, mayúsculas). */
  normalized?: string;
  /** Motivo del fallo, con clave i18n para traducir en UI. */
  error?: { code: string; messageKey: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// getTaxRates
// ─────────────────────────────────────────────────────────────────────────────

/** Una tasa de impuesto concreta aplicable en la jurisdicción. */
export interface TaxRate {
  /** Código estable e interno, p. ej. "IVA_STANDARD", "IRPF_GENERAL", "ITBIS_STANDARD". */
  code: string;
  /** Etiqueta legible (clave i18n). */
  labelKey: string;
  /** Porcentaje como string decimal, p. ej. "21" para 21 %. */
  ratePercent: string;
  /** true si es una retención (resta del total), false si se suma (impuesto sobre el valor). */
  withholding: boolean;
}

export interface TaxRatesResult {
  jurisdiction: Jurisdiction;
  rates: TaxRate[];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildInvoiceRecord
// ─────────────────────────────────────────────────────────────────────────────

/** Línea de factura (entrada neutral que produce el núcleo). */
export interface InvoiceLineInput {
  description: string;
  /** Cantidad (horas, unidades…) como string decimal. */
  quantity: string;
  /** Precio unitario como string decimal, sin impuestos. */
  unitPrice: string;
  /** Código de impuesto a aplicar (de getTaxRates), p. ej. "IVA_STANDARD". */
  taxCode: string;
}

/** Datos neutrales de una factura que el núcleo entrega al provider. */
export interface InvoiceInput {
  invoiceNumber: string;
  issueDate: string; // ISO 8601
  currency: string; // EUR | DOP
  seller: PartyInput;
  buyer: PartyInput;
  lines: InvoiceLineInput[];
  /**
   * Código de retención a aplicar sobre la base imponible total (p. ej. "IRPF_GENERAL" en ES).
   * No aplica en RD. Si se omite, no hay retención.
   */
  withholdingTaxCode?: string;
  /** Hash del registro fiscal inmediatamente anterior (encadenamiento Verifactu). */
  previousRecordHash?: string;
}

export interface PartyInput {
  name: string;
  /** Identificador fiscal en bruto (NIF/CIF · RNC/Cédula). */
  taxId: string;
  address?: string;
  country?: string;
}

/**
 * Resultado del registro fiscal. El núcleo lo persiste como JSON opaco en `Invoice.complianceRecord`
 * sin interpretarlo. Cada país rellena su `format` y `payload`.
 */
export interface InvoiceRecord {
  jurisdiction: Jurisdiction;
  /** "VERIFACTU" (ES) | "ECF" (RD). */
  format: string;
  /** Totales calculados, neutrales, para mostrar en UI/ledger. */
  totals: InvoiceTotals;
  /**
   * Carga específica del país:
   *  - ES: registro de alta Verifactu (hash, previousHash, qrUrl, huella…).
   *  - RD: e-CF como string XML conforme al estándar DGII, listo para firma.
   */
  payload: Record<string, unknown>;
  /** Hash de este registro (para encadenar el siguiente). Lo usa el núcleo como previousRecordHash. */
  recordHash?: string;
  /** Estado del envío al organismo. En el MVP siempre "STUBBED". */
  submission: { status: 'STUBBED' | 'PENDING' | 'ACCEPTED' | 'REJECTED'; detail?: string };
}

export interface InvoiceTotals {
  /** Base imponible total (suma de líneas sin impuestos). */
  taxableBase: string;
  /** Impuestos repercutidos (IVA/ITBIS). */
  taxAmount: string;
  /** Retenciones (IRPF en ES); "0" si no aplica. */
  withholdingAmount: string;
  /** Total a pagar = base + impuestos − retenciones. */
  total: string;
}

/**
 * Pre-cálculo READ-ONLY de una factura (sin emitirla ni encadenarla). Devuelve los mismos totales
 * que produciría la emisión real y el formato fiscal de la jurisdicción, para alimentar un preview
 * en vivo en la UI sin duplicar la matemática fiscal en el cliente.
 */
export interface InvoicePreview {
  jurisdiction: Jurisdiction;
  /** Formato del registro fiscal de la jurisdicción: "VERIFACTU" (ES) | "ECF" (RD). */
  format: string;
  /** Totales neutrales (idénticos a los que `buildInvoiceRecord` persistiría). */
  totals: InvoiceTotals;
}

// ─────────────────────────────────────────────────────────────────────────────
// getProceduralDeadlines
// ─────────────────────────────────────────────────────────────────────────────

export interface ProceduralDeadlineParams {
  /** Tipo de plazo, p. ej. "APELACION", "CONTESTACION_DEMANDA". Específico por país. */
  deadlineType: string;
  /** Fecha de inicio del cómputo (ISO 8601), normalmente la notificación. */
  startDate: string;
  /** Días del plazo (hábiles salvo que el provider indique lo contrario). */
  days: number;
  /**
   * Festivos LOCALES adicionales del despacho (ISO yyyy-mm-dd), que se suman a los festivos
   * nacionales de la jurisdicción. Permite afinar el cómputo con el calendario propio del despacho.
   */
  extraHolidays?: string[];
}

export interface ProceduralDeadlineResult {
  deadlineType: string;
  startDate: string;
  /** Fecha límite calculada (ISO 8601). */
  dueDate: string;
  /** true si se computó en días hábiles (descontando festivos/fines de semana). */
  businessDays: boolean;
  /** Festivos aplicados en el cálculo (ISO 8601). */
  holidaysApplied: string[];
  /** Avisos (p. ej. "calendario judicial RD no consolidado"). */
  notes?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// getCourtIntegration
// ─────────────────────────────────────────────────────────────────────────────

/** Integración con el sistema de notificaciones judiciales (LexNET en ES). */
export interface CourtIntegration {
  available: boolean;
  /** Identificador del sistema, p. ej. "LEXNET". undefined si no disponible. */
  system?: string;
  /** Stub del modelo de notificaciones/acuses/escritos cuando esté disponible. */
  listNotifications?(): Promise<CourtNotification[]>;
  acknowledge?(notificationId: string): Promise<CourtAcknowledgement>;
  submitFiling?(filing: CourtFiling): Promise<CourtFilingReceipt>;
}

export interface CourtNotification {
  id: string;
  court: string;
  caseReference: string;
  receivedAt: string;
  subject: string;
  acknowledged: boolean;
}

export interface CourtAcknowledgement {
  notificationId: string;
  acknowledgedAt: string;
}

export interface CourtFiling {
  caseReference: string;
  documentRefs: string[];
  type: string;
}

export interface CourtFilingReceipt {
  filingId: string;
  acceptedAt: string;
  status: 'ACCEPTED' | 'REJECTED';
}

// ─────────────────────────────────────────────────────────────────────────────
// getFiscalReports
// ─────────────────────────────────────────────────────────────────────────────

/** Generación de informes fiscales: SII (ES); 606 compras / 607 ventas (RD). */
export interface FiscalReports {
  /** Códigos de informe soportados, p. ej. ["SII"] (ES) | ["606","607"] (RD). */
  supported: string[];
  generate(reportCode: string, params: FiscalReportParams): Promise<FiscalReportResult>;
}

export interface FiscalReportParams {
  /** Periodo en formato "YYYY-MM" o "YYYY-Qn". */
  period: string;
}

export interface FiscalReportResult {
  reportCode: string;
  period: string;
  /** Formato del contenido: "XML" | "CSV" | "JSON". */
  format: string;
  /** Contenido generado (en el MVP, estructura representativa). */
  content: string;
  /** Estado del envío al organismo. En el MVP "STUBBED". */
  submission: { status: 'STUBBED' | 'PENDING' | 'ACCEPTED' | 'REJECTED'; detail?: string };
}
