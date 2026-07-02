/**
 * SignatureProvider — frontera de FIRMA ELECTRÓNICA del documento ante el proveedor (Signaturit).
 *
 * Separa el documento del despacho (ya generado/subido) de su firma cualificada, que requiere red,
 * credenciales y la plataforma del proveedor, y por tanto vive detrás de su propia interfaz
 * enchufable. En el MVP cubrimos **Signaturit** (firma electrónica avanzada/cualificada, eIDAS),
 * pluggable a DocuSign u otros sin tocar el núcleo.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * PUNTO DE INTEGRACIÓN: aquí se enchufa el cliente real. Hoy la implementación es un STUB que NO
 * transmite (`requestSignature` devuelve `status: 'STUBBED'`), pero respeta la FORMA EXACTA del
 * cliente real:
 *   · firma de los métodos (`requestSignature` / `getStatus` / `cancel`),
 *   · idempotencia por `externalId` (misma versión de documento → mismo identificador, sin doble alta),
 *   · verificación de la firma HMAC del webhook entrante (la plataforma confirma la firma por callback).
 * Para activar el envío real basta sustituir el cuerpo por el cliente HTTP de Signaturit; ni el núcleo
 * (`apps/api`) ni la UI necesitan cambiar.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Estados del ciclo de vida de una solicitud de firma. */
export type SignatureStatus =
  /** No transmitido (no hay cliente real conectado); la solicitud queda creada como PENDING. */
  | 'STUBBED'
  /** Solicitada; a la espera de que el firmante actúe. */
  | 'PENDING'
  /** Firmada por el destinatario. */
  | 'SIGNED'
  /** Rechazada por el destinatario. */
  | 'DECLINED'
  /** Caducada sin firmar. */
  | 'EXPIRED'
  /** Cancelada por el despacho. */
  | 'CANCELED';

/** Datos mínimos para iniciar una solicitud de firma de una versión concreta de documento. */
export interface SignatureRequestInput {
  /**
   * Identificador interno estable de lo que se firma (id de la versión del documento). Se usa para
   * derivar un `externalId` determinista, de modo que reintentar no genere una doble solicitud.
   */
  reference: string;
  /** Nombre legible del documento (asunto del envío al firmante). */
  documentName: string;
  /** Nombre del firmante. */
  signerName: string;
  /** Email del firmante (destino del envío). */
  signerEmail: string;
  /** Bytes del documento a firmar. El adaptador STUBBED los ignora (no transmite). */
  documentBuffer: Buffer;
  /** MIME type del documento (para el envío multipart al proveedor). */
  documentMimeType: string;
}

/** Documento firmado descargado del proveedor (bytes + tipo) tras un evento `SIGNED`. */
export interface SignedDocumentResult {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Resultado de un intento ante el proveedor de firma. Forma EXACTA que devolverá el cliente real
 * cuando se enchufe la transmisión; en el MVP `requestSignature` devuelve `STUBBED` pero con todos
 * los campos poblados para que el seam del núcleo no cambie al activar el envío.
 */
export interface SignatureResult {
  status: SignatureStatus;
  /** Detalle legible (mensaje del proveedor o nota del stub). */
  detail?: string;
  /** Identificador asignado por el proveedor a la solicitud (idempotencia + consulta posterior). */
  externalId?: string;
  /**
   * Id del DOCUMENTO dentro del sobre del proveedor. Crítico para el webhook real de Signaturit:
   * sus eventos NO traen el id del sobre, solo `document.id`, así que la correlación con la fila
   * local se hace por este campo.
   */
  externalDocumentId?: string;
  /** URL de firma para el destinatario (en el stub, un enlace determinista de Signaturit). */
  signUrl?: string;
  /** Marca de tiempo del intento (ISO 8601). */
  timestamp?: string;
}

/**
 * Evento normalizado del webhook del proveedor. Dos formatos de origen:
 *  - REAL de Signaturit (`{type, created_at, document}`): identifica por `document.id` →
 *    `externalDocumentId`; NO trae el id del sobre ni tenant.
 *  - LEGADO/interno (`{externalId, tenantId, status}`): usado por tests y herramientas internas.
 * En ambos casos el tenant se resuelve SIEMPRE desde la fila local (nunca del payload).
 */
export interface SignatureWebhookEvent {
  /** Id del sobre del proveedor, si el payload lo trae (formato legado). */
  externalId?: string;
  /** Id del documento del proveedor (formato real de Signaturit: `document.id`). */
  externalDocumentId?: string;
  /** Presente solo en el formato legado; se valida su presencia pero se IGNORA su valor. */
  tenantId?: string;
  /** Nuevo estado de la solicitud (SIGNED/DECLINED/EXPIRED/CANCELED/PENDING). */
  status: SignatureStatus;
  detail?: string;
}

export interface SignatureProvider {
  /** Proveedor que cubre este adaptador: "SIGNATURIT". Identifica el sistema en logs y persistencia. */
  readonly provider: string;

  /**
   * Inicia (o reinicia) una solicitud de firma y devuelve el resultado del intento.
   * Idempotente por `externalId` (misma `reference` → mismo identificador).
   */
  requestSignature(input: SignatureRequestInput): Promise<SignatureResult>;

  /** Consulta el estado de una solicitud previa por su identificador del proveedor. */
  getStatus(externalId: string): Promise<SignatureResult>;

  /** Cancela una solicitud en curso. */
  cancel(externalId: string): Promise<SignatureResult>;

  /**
   * Verifica la firma HMAC-SHA256 del cuerpo CRUDO del webhook entrante contra el secreto compartido.
   * Devuelve `false` (nunca lanza) si falta el secreto/firma o no coincide; comparación en tiempo
   * constante para no filtrar información por temporización.
   */
  verifyWebhook(
    rawBody: string,
    signature: string | undefined,
    secret: string | undefined,
  ): boolean;

  /** Normaliza el cuerpo del webhook del proveedor a un evento interno; `null` si es inválido. */
  parseWebhook(rawBody: string): SignatureWebhookEvent | null;

  /**
   * Descarga el documento firmado (con evidencias) tras un evento `SIGNED`. `null` si el adaptador no
   * transmite (STUBBED) o el proveedor no tiene el documento disponible.
   */
  downloadSignedDocument(externalId: string): Promise<SignedDocumentResult | null>;

  /**
   * `true` si el adaptador tiene credenciales y transmite de verdad. Permite al caller distinguir
   * "no hay proveedor del que descargar" (stub: seguir sin documento) de "el proveedor vivo falló la
   * descarga" (reintentar: el PDF firmado con evidencias no puede perderse).
   */
  isConfigured(): boolean;
}

/** Token de inyección (Nest) para resolver el proveedor de firma configurado. */
export const SIGNATURE_PROVIDER = Symbol('SIGNATURE_PROVIDER');
