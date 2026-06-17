import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  SignatureProvider,
  SignatureRequestInput,
  SignatureResult,
  SignatureStatus,
  SignatureWebhookEvent,
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

/**
 * Firma electrónica vía Signaturit (eIDAS). STUB: NO transmite (`requestSignature` devuelve
 * `STUBBED`), pero con la forma EXACTA del cliente real. Activar = sustituir el cuerpo por el cliente
 * HTTP de Signaturit (API key + plantilla de firma). Ver `signature.interface.ts`.
 */
export class SignaturitSignatureProvider implements SignatureProvider {
  readonly provider = 'SIGNATURIT';

  requestSignature(input: SignatureRequestInput): Promise<SignatureResult> {
    const externalId = deterministicSignatureId(input.reference);
    return Promise.resolve({
      status: 'STUBBED',
      detail:
        'Solicitud de firma en Signaturit no transmitida (adaptador listo; requiere API key + plantilla).',
      externalId,
      // Enlace determinista de firma para el destinatario (forma del enlace real de Signaturit).
      signUrl: `https://app.signaturit.com/sign/${externalId.toLowerCase()}`,
      timestamp: new Date().toISOString(),
    });
  }

  getStatus(externalId: string): Promise<SignatureResult> {
    return Promise.resolve({
      status: 'STUBBED',
      detail: 'Consulta de estado en Signaturit no implementada (adaptador listo).',
      externalId,
      timestamp: new Date().toISOString(),
    });
  }

  cancel(externalId: string): Promise<SignatureResult> {
    return Promise.resolve({
      status: 'CANCELED',
      detail:
        'Solicitud de firma cancelada localmente (adaptador listo; sin transmisión a Signaturit).',
      externalId,
      timestamp: new Date().toISOString(),
    });
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
