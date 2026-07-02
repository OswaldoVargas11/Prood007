import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  SignatureProvider,
  SignatureRequestInput,
  SignatureResult,
  SignatureStatus,
  SignatureWebhookEvent,
  SignedDocumentResult,
} from '../signature.interface';

/**
 * Identificador estable derivado de la versión de documento (idempotencia entre reintentos): misma
 * `reference` → mismo `externalId`, de modo que reenviar no genere una doble solicitud en Signaturit.
 */
export function deterministicSignatureId(reference: string): string {
  const compact = reference
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24)
    .toUpperCase();
  return `SIGNATURIT-${compact || 'NA'}`;
}

/** Estados que el proveedor puede comunicar por webhook (transiciones terminales + recordatorio). */
const WEBHOOK_STATUSES: readonly SignatureStatus[] = [
  'PENDING',
  'SIGNED',
  'DECLINED',
  'EXPIRED',
  'CANCELED',
];

/** Mapea el estado devuelto por la API de Signaturit a nuestro enum interno. */
function mapRemoteStatus(remote: string | undefined): SignatureStatus {
  switch ((remote ?? '').toLowerCase()) {
    case 'completed':
    case 'signed':
      return 'SIGNED';
    case 'declined':
      return 'DECLINED';
    case 'expired':
      return 'EXPIRED';
    case 'canceled':
    case 'cancelled':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}

const DEFAULT_BASE_URL = 'https://api.sandbox.signaturit.com';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Firma electrónica vía Signaturit (eIDAS). Gated por `SIGNATURIT_API_KEY`: sin ella, el adaptador NO
 * transmite (`requestSignature` devuelve `STUBBED`), igual que antes. Con ella, llama a la API real
 * (v3) — confirma los nombres de campo/endpoints contra la documentación vigente de Signaturit
 * (https://docs.signaturit.com) si difieren; el seam (forma de `SignatureProvider`) no cambia.
 */
export class SignaturitSignatureProvider implements SignatureProvider {
  readonly provider = 'SIGNATURIT';

  private apiKey(): string | undefined {
    return process.env.SIGNATURIT_API_KEY?.trim() || undefined;
  }

  /** Con API key el adaptador transmite de verdad; sin ella opera en modo STUBBED. */
  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  private baseUrl(): string {
    return (process.env.SIGNATURIT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private signal(): AbortSignal {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }

  async requestSignature(input: SignatureRequestInput): Promise<SignatureResult> {
    const externalId = deterministicSignatureId(input.reference);
    const apiKey = this.apiKey();
    if (!apiKey) {
      return {
        status: 'STUBBED',
        detail:
          'Solicitud de firma en Signaturit no transmitida (adaptador listo; requiere API key + plantilla).',
        externalId,
        // Enlace determinista de firma para el destinatario (forma del enlace real de Signaturit).
        signUrl: `https://app.signaturit.com/sign/${externalId.toLowerCase()}`,
        timestamp: new Date().toISOString(),
      };
    }

    const form = new FormData();
    form.append('recipients[0][email]', input.signerEmail);
    form.append('recipients[0][name]', input.signerName);
    form.append('subject', input.documentName);
    form.append(
      'files[0]',
      new Blob([input.documentBuffer], { type: input.documentMimeType }),
      input.documentName,
    );

    try {
      const res = await fetch(`${this.baseUrl()}/v3/signatures.json`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: this.signal(),
      });
      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(`Signaturit: HTTP ${res.status} ${JSON.stringify(raw)}`);
      }
      const id = typeof raw.id === 'string' ? raw.id : externalId;
      const documents = Array.isArray(raw.documents) ? raw.documents : [];
      const signUrl =
        (documents[0] as { events?: { require_signature_url?: string } } | undefined)?.events
          ?.require_signature_url ?? undefined;
      return {
        status: 'PENDING',
        detail: 'Solicitud de firma enviada a Signaturit.',
        externalId: id,
        signUrl,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      // Fallo de transporte: NO devolver PENDING con el id determinista local — si Signaturit sí llegó
      // a crear el sobre (p. ej. timeout tras enviar), su id real jamás casaría con el guardado y
      // ningún webhook encontraría la fila. Mejor fallar la solicitud (el usuario reintenta y
      // `requestBatch` ya tolera fallos por versión) que persistir una solicitud fantasma.
      throw new Error(`No se pudo enviar la solicitud a Signaturit: ${(err as Error).message}`);
    }
  }

  async getStatus(externalId: string): Promise<SignatureResult> {
    const apiKey = this.apiKey();
    if (!apiKey) {
      return {
        status: 'STUBBED',
        detail: 'Consulta de estado en Signaturit no implementada (adaptador listo).',
        externalId,
        timestamp: new Date().toISOString(),
      };
    }
    try {
      const res = await fetch(`${this.baseUrl()}/v3/signatures/${externalId}.json`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: this.signal(),
      });
      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(`Signaturit: HTTP ${res.status}`);
      return {
        status: mapRemoteStatus(raw.status as string | undefined),
        externalId,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'PENDING',
        detail: `No se pudo consultar el estado en Signaturit: ${(err as Error).message}`,
        externalId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async cancel(externalId: string): Promise<SignatureResult> {
    const apiKey = this.apiKey();
    if (!apiKey) {
      return {
        status: 'CANCELED',
        detail:
          'Solicitud de firma cancelada localmente (adaptador listo; sin transmisión a Signaturit).',
        externalId,
        timestamp: new Date().toISOString(),
      };
    }
    try {
      const res = await fetch(`${this.baseUrl()}/v3/signatures/${externalId}/cancel.json`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: this.signal(),
      });
      if (!res.ok) throw new Error(`Signaturit: HTTP ${res.status}`);
      return {
        status: 'CANCELED',
        detail: 'Solicitud de firma cancelada en Signaturit.',
        externalId,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      // La cancelación local ya ocurre en el servicio pese a que la transmisión falle (best-effort).
      return {
        status: 'CANCELED',
        detail: `Cancelada localmente; no se pudo confirmar en Signaturit: ${(err as Error).message}`,
        externalId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async downloadSignedDocument(externalId: string): Promise<SignedDocumentResult | null> {
    const apiKey = this.apiKey();
    if (!apiKey) return null;
    try {
      const envelopeRes = await fetch(`${this.baseUrl()}/v3/signatures/${externalId}.json`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: this.signal(),
      });
      if (!envelopeRes.ok) return null;
      const envelope = (await envelopeRes.json().catch(() => ({}))) as {
        documents?: { id?: string }[];
      };
      const documentId = envelope.documents?.[0]?.id;
      if (!documentId) return null;

      const fileRes = await fetch(
        `${this.baseUrl()}/v3/signatures/${externalId}/documents/${documentId}/download/signed`,
        { headers: { Authorization: `Bearer ${apiKey}` }, signal: this.signal() },
      );
      if (!fileRes.ok) return null;
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const mimeType = fileRes.headers.get('content-type') || 'application/pdf';
      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  verifyWebhook(
    rawBody: string,
    signature: string | undefined,
    secret: string | undefined,
  ): boolean {
    if (!secret || !signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): SignatureWebhookEvent | null {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (typeof payload !== 'object' || payload === null) return null;
    const p = payload as Record<string, unknown>;
    const externalId = typeof p.externalId === 'string' ? p.externalId : undefined;
    const tenantId = typeof p.tenantId === 'string' ? p.tenantId : undefined;
    const status = typeof p.status === 'string' ? p.status.toUpperCase() : undefined;
    if (!externalId || !tenantId || !status) return null;
    if (!WEBHOOK_STATUSES.includes(status as SignatureStatus)) return null;
    return {
      externalId,
      tenantId,
      status: status as SignatureStatus,
      detail: typeof p.detail === 'string' ? p.detail : undefined,
    };
  }
}
