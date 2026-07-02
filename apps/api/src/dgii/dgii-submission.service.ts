import { Injectable } from '@nestjs/common';
import { DgiiConfig } from './dgii.config';
import { DgiiClient } from './dgii.client';
import { loadCertFromP12 } from './dgii-cert';

/** Estado del envío, espejo de `SubmissionResult` de @legalflow/compliance (sin acoplar el import). */
export type DgiiStatus = 'STUBBED' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface DgiiSubmissionResult {
  status: DgiiStatus;
  detail?: string;
  /** TrackId asignado por la DGII (para consultar el acuse después). */
  externalId?: string;
  timestamp: string;
}

/** Certificado del emisor (PKCS#12) que el despacho aporta; se descifra en memoria solo para firmar. */
export interface DgiiCert {
  p12: Buffer;
  password: string;
}

/**
 * Transmisión real del e-CF a la DGII. GATED: si `DGII_ENV` no está definido devuelve `STUBBED` (mismo
 * comportamiento que hoy, sin tocar nada). Nunca lanza por un rechazo del organismo: lo envuelve en
 * `{ status: 'REJECTED', detail }` (contrato de `TaxSubmissionProvider`). En la Fase 2 se cablea a la
 * emisión de facturas (jurisdicción DO) y se persiste el estado/TrackId en `Invoice`.
 */
@Injectable()
export class DgiiSubmissionService {
  constructor(private readonly config: DgiiConfig) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  private now(): string {
    return new Date().toISOString();
  }

  /** Firma y transmite un e-CF; devuelve PENDING + TrackId (el acuse final se consulta con getStatus). */
  async submit(ecfXml: string, cert: DgiiCert): Promise<DgiiSubmissionResult> {
    if (!this.config.enabled) {
      return {
        status: 'STUBBED',
        detail:
          'Transmisión e-CF a la DGII no activada (define DGII_ENV y el certificado del despacho).',
        timestamp: this.now(),
      };
    }
    try {
      const material = loadCertFromP12(cert.p12, cert.password);
      const client = new DgiiClient(this.config);
      const token = await client.authenticate(material);
      const sent = await client.sendEcf(ecfXml, material, token);
      return {
        status: 'PENDING',
        externalId: sent.trackId ?? undefined,
        detail: `e-CF enviado a la DGII (${this.config.env}); pendiente de acuse.`,
        timestamp: this.now(),
      };
    } catch (e) {
      // Fallo de TRANSPORTE (red, timeout, HTTP no-ok), no un rechazo del organismo: queda PENDING sin
      // TrackId para que el cron de reintento lo retransmita con backoff. REJECTED se reserva para el
      // acuse negativo real de la DGII; el tope de intentos del cron corta los fallos permanentes.
      return {
        status: 'PENDING',
        detail: `Error transmitiendo a la DGII (se reintentará): ${(e as Error).message}`,
        timestamp: this.now(),
      };
    }
  }

  /** Consulta el acuse/estado de un envío previo por su TrackId. */
  async getStatus(trackId: string, cert: DgiiCert): Promise<DgiiSubmissionResult> {
    if (!this.config.enabled) {
      return { status: 'STUBBED', externalId: trackId, timestamp: this.now() };
    }
    try {
      const material = loadCertFromP12(cert.p12, cert.password);
      const client = new DgiiClient(this.config);
      const token = await client.authenticate(material);
      const st = await client.queryStatus(trackId, token);
      return {
        status: mapEstado(st.estado),
        externalId: trackId,
        detail: st.estado ?? undefined,
        timestamp: this.now(),
      };
    } catch (e) {
      // Fallo de TRANSPORTE al consultar el acuse: el envío sigue en trámite, NO es un rechazo. Queda
      // PENDING y el cron de polling volverá a consultar.
      return {
        status: 'PENDING',
        externalId: trackId,
        detail: `Error consultando el acuse en la DGII (se reintentará): ${(e as Error).message}`,
        timestamp: this.now(),
      };
    }
  }
}

/** Mapea el estado textual de la DGII a nuestro enum de estados. */
function mapEstado(estado: string | null): DgiiStatus {
  const e = (estado ?? '').toLowerCase();
  if (e.includes('acept') || e.includes('aprob')) return 'ACCEPTED';
  if (e.includes('rechaz')) return 'REJECTED';
  return 'PENDING';
}
