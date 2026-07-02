/**
 * Lógica PURA del cron de reintento/polling de e-CF (sin BD ni red): decide qué hacer con una factura
 * PENDING según su fase (envío vs acuse), su contador de intentos y el backoff exponencial. Testeable
 * en aislamiento; el cron solo ejecuta la decisión.
 */

/** Tope de intentos automáticos por fase (envío o acuse). El reintento manual siempre queda disponible. */
export const ECF_MAX_AUTO_ATTEMPTS = 8;

/** Backoff exponencial: base 5 min × 2^intentos, con techo de 6 h entre intentos. */
export const ECF_RETRY_BASE_MS = 5 * 60_000;
export const ECF_RETRY_MAX_DELAY_MS = 6 * 60 * 60_000;

export interface EcfRetryCandidate {
  /** Intentos automáticos de la fase actual (`Invoice.ecfAttempts`). */
  ecfAttempts: number;
  /** Último intento (la transmisión sella `ecfSubmittedAt` en cada intento/consulta). */
  ecfSubmittedAt: Date | null;
  /** Con TrackId = fase de ACUSE (polling); sin él = fase de ENVÍO (retransmitir). */
  ecfTrackId: string | null;
}

export type EcfRetryDecision =
  /** Retransmitir el e-CF (fase de envío, backoff cumplido). */
  | 'retry'
  /** Consultar el acuse por TrackId (fase de acuse, backoff cumplido). */
  | 'poll'
  /** Aún dentro de la ventana de backoff: no tocar en este barrido. */
  | 'wait'
  /** Tope de intentos automáticos alcanzado: cerrar (envío → REJECTED; acuse → nota manual). */
  | 'exhausted';

/** Espera antes del intento N (0-indexado): 5 min, 10, 20, 40, 80… con techo de 6 h. */
export function ecfRetryDelayMs(attempts: number): number {
  return Math.min(ECF_RETRY_BASE_MS * 2 ** attempts, ECF_RETRY_MAX_DELAY_MS);
}

export function decideEcfRetry(invoice: EcfRetryCandidate, now: Date): EcfRetryDecision {
  if (invoice.ecfAttempts >= ECF_MAX_AUTO_ATTEMPTS) return 'exhausted';
  // Sin sello de intento previo (no debería ocurrir en PENDING): actúa ya, sin backoff que computar.
  const last = invoice.ecfSubmittedAt?.getTime() ?? 0;
  if (last + ecfRetryDelayMs(invoice.ecfAttempts) > now.getTime()) return 'wait';
  return invoice.ecfTrackId ? 'poll' : 'retry';
}
