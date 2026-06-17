/**
 * TaxSubmissionProvider — frontera de ENVÍO del registro fiscal al organismo recaudador.
 *
 * Separa la GENERACIÓN del registro fiscal (`ComplianceProvider.buildInvoiceRecord`, ya correcta
 * estructuralmente) de su TRANSMISIÓN al organismo, que requiere red, certificado y credenciales
 * y por tanto vive detrás de su propia interfaz enchufable:
 *  - ES: alta del registro Verifactu en la AEAT (servicio SOAP/REST con certificado del despacho).
 *  - RD: emisión del e-CF a la DGII (recepción → acuse → estado de aprobación).
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * PUNTO DE INTEGRACIÓN: aquí se enchufa el cliente real. Hoy las implementaciones son STUBS que NO
 * transmiten (devuelven `status: 'STUBBED'`), pero respetan la FORMA EXACTA del cliente real:
 *   · firma de los métodos (`submit` / `getStatus`),
 *   · manejo de errores (resultado `REJECTED` con detalle, nunca excepción de red sin envolver),
 *   · idempotencia por `externalId` (mismo registro → mismo identificador, sin doble alta).
 * Para activar la transmisión real basta sustituir el cuerpo de `submit`/`getStatus` por el cliente
 * HTTP/SOAP; ni el núcleo (`apps/api`) ni el seam del ledger necesitan cambiar.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
import type { Jurisdiction } from '@legalflow/domain';
import type { InvoiceRecord, SubmissionResult } from './types';

export interface TaxSubmissionProvider {
  /** Jurisdicción cuyo organismo cubre este proveedor de envío. */
  readonly jurisdiction: Jurisdiction;

  /**
   * Organismo destino del envío: "AEAT" (ES, Verifactu) | "DGII" (RD, e-CF). Identifica el
   * sistema en logs y en el `submission.detail` persistido.
   */
  readonly authority: string;

  /**
   * Envía (o reenvía) el registro fiscal al organismo y devuelve el resultado del intento.
   *
   * Contrato del cliente real (que el stub ya respeta):
   *  - NUNCA lanza por un rechazo del organismo: un envío rechazado se devuelve como
   *    `{ status: 'REJECTED', detail }`. Solo errores de programación deberían propagarse.
   *  - Idempotente por `externalId`: dado el mismo registro (mismo `recordHash`), produce el
   *    mismo `externalId`, de modo que un reintento no genere un alta duplicada en el organismo.
   *
   * @param record Registro fiscal ya generado y estructuralmente correcto (Verifactu / e-CF).
   */
  submit(record: InvoiceRecord): Promise<SubmissionResult>;

  /**
   * Consulta el estado de un envío previo por su identificador del organismo (CSV AEAT / TrackId
   * DGII). En el stub devuelve el mismo estado no transmitido; el cliente real consultaría el
   * servicio de cotejo del organismo.
   */
  getStatus(externalId: string): Promise<SubmissionResult>;
}

/** Token de inyección (Nest) para resolver el proveedor de envío del tenant en curso. */
export const TAX_SUBMISSION_PROVIDER = Symbol('TAX_SUBMISSION_PROVIDER');
