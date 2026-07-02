import { UnprocessableEntityException } from '@nestjs/common';
import { Jurisdiction } from '@legalflow/domain';
import { apiError } from '../common/api-messages';

/**
 * Verja de capacidad de emisión (Parte A): valida ANTES de emitir que el despacho PUEDE emitir en el
 * formato fiscal solicitado. Función PURA (sin BD ni reloj propio) para poder cubrirla exhaustivamente
 * con pruebas unitarias; el `LedgerService` le pasa el estado ya leído bajo el advisory lock de emisión.
 *
 * Reglas (HTTP 422 — la petición es válida pero el despacho no está en condiciones de emitir así):
 *  - ES (Verifactu): sin verja. El régimen Verifactu está APLAZADO (2027) y es voluntario hasta entonces;
 *    exigir certificado hoy rompería toda la emisión ES en producción.
 *  - RD (e-CF):
 *      1) Si HAY un rango eNCF registrado para el tipo de comprobante pero está VENCIDO o AGOTADO → 422,
 *         siempre (aunque la transmisión a la DGII esté apagada): ese rango ya no sirve para numerar.
 *      2) Si la transmisión REAL a la DGII está activada (`DGII_ENV`, `dgiiEnabled`), la emisión de un
 *         e-CF de verdad EXIGE un rango vigente registrado + el certificado digital del despacho. Con la
 *         DGII apagada (stub, comportamiento por defecto) se conserva el arranque gradual documentado: sin
 *         rango se cae a la serie interna (fallback en `emitInvoiceInTx`), sin bloquear al despacho.
 */
export interface EcfRangeState {
  /** Caducidad del rango (null = sin caducidad). */
  expiresAt: Date | null;
  /** Próximo eNCF a asignar. */
  next: number;
  /** Último eNCF del rango autorizado. */
  rangeEnd: number;
}

export interface EmissionGuardInput {
  /** Formato fiscal EFECTIVO de la factura (es = Verifactu · do = e-CF). */
  invoiceFormat: Jurisdiction;
  /** Tipo de comprobante e-CF (31 crédito fiscal · 34 nota de crédito). Solo relevante para RD. */
  ncfType: string;
  /** Rango eNCF del tipo (null si el despacho aún no lo registró). */
  ecfRange: EcfRangeState | null;
  /** ¿El despacho tiene cargado el certificado .p12 de e-CF? */
  hasEcfCertificate: boolean;
  /** ¿Transmisión real a la DGII activada? (solo si `DGII_ENV` está definido). */
  dgiiEnabled: boolean;
  /** Reloj inyectado (ms epoch) para que la caducidad sea determinista en pruebas. */
  now: number;
}

/** Lanza 422 si el despacho no puede emitir en el formato solicitado; no devuelve nada en caso válido. */
export function assertCanEmitFormat(input: EmissionGuardInput): void {
  // ES / Verifactu: sin verja (régimen aplazado y voluntario).
  if (input.invoiceFormat !== Jurisdiction.DO) return;

  const { ecfRange, dgiiEnabled, hasEcfCertificate, ncfType, now } = input;

  // 1) Rango registrado pero inservible (vencido/agotado): corta siempre, con o sin DGII.
  if (ecfRange) {
    if (ecfRange.expiresAt && ecfRange.expiresAt.getTime() < now) {
      throw new UnprocessableEntityException(
        apiError('dgii.encfRangeExpired', { params: { ncfType } }),
      );
    }
    if (ecfRange.next > ecfRange.rangeEnd) {
      throw new UnprocessableEntityException(
        apiError('dgii.encfRangeExhausted', { params: { ncfType } }),
      );
    }
  }

  // 2) e-CF REAL (DGII activada): exige rango vigente + certificado del despacho.
  if (dgiiEnabled) {
    if (!ecfRange) {
      throw new UnprocessableEntityException(
        apiError('dgii.encfRangeMissing', { params: { ncfType } }),
      );
    }
    if (!hasEcfCertificate) {
      throw new UnprocessableEntityException(apiError('ledger.ecfCertRequired'));
    }
  }
}
