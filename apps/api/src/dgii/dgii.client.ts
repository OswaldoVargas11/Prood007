import { DgiiConfig } from './dgii.config';
import { signEnvelopedXml } from './dgii-signer';
import type { DgiiCertMaterial } from './dgii-cert';

export interface DgiiSendResult {
  trackId: string | null;
  raw: unknown;
}
export interface DgiiStatusResult {
  /** Estado tal cual lo devuelve la DGII (p. ej. "Aceptado" / "Rechazado" / "En Proceso"). */
  estado: string | null;
  raw: unknown;
}

/**
 * Cliente del flujo de Facturación Electrónica de la DGII:
 *   1) GET semilla → 2) firmar semilla → 3) POST validación de semilla → token Bearer
 *   4) firmar e-CF → 5) POST recepción → TrackId → 6) GET consulta de estado (acuse).
 *
 * Los nombres de campo del multipart y la forma de las respuestas siguen el patrón público de la DGII;
 * confírmalos contra el kit de certificación vigente (ver DGII_SETUP.md). El flujo y el seam no cambian.
 */
export class DgiiClient {
  constructor(private readonly config: DgiiConfig) {}

  private signal(): AbortSignal {
    return AbortSignal.timeout(this.config.timeoutMs);
  }

  /** Pasos 1–3: obtiene la semilla, la firma con el certificado y la valida → token de sesión. */
  async authenticate(cert: DgiiCertMaterial): Promise<string> {
    const ep = this.config.endpoints;
    const seedRes = await fetch(ep.semilla, { signal: this.signal() });
    if (!seedRes.ok) throw new Error(`DGII semilla: HTTP ${seedRes.status}`);
    const seedXml = await seedRes.text();

    const signedSeed = signEnvelopedXml(seedXml, cert);
    const form = new FormData();
    form.append('xml', new Blob([signedSeed], { type: 'application/xml' }), 'semilla.xml');

    const tokRes = await fetch(ep.validarSemilla, {
      method: 'POST',
      body: form,
      signal: this.signal(),
    });
    if (!tokRes.ok) throw new Error(`DGII validación de semilla: HTTP ${tokRes.status}`);
    const tok = (await tokRes.json().catch(() => ({}))) as { token?: string };
    if (!tok.token) throw new Error('DGII no devolvió token de sesión.');
    return tok.token;
  }

  /** Pasos 4–5: firma el e-CF y lo envía a recepción → TrackId. */
  async sendEcf(ecfXml: string, cert: DgiiCertMaterial, token: string): Promise<DgiiSendResult> {
    const signed = signEnvelopedXml(ecfXml, cert);
    const form = new FormData();
    form.append('xml', new Blob([signed], { type: 'application/xml' }), 'ecf.xml');

    const res = await fetch(this.config.endpoints.recepcion, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: this.signal(),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`DGII recepción: HTTP ${res.status} ${JSON.stringify(raw)}`);
    const trackId = (raw.trackId as string) ?? (raw.TrackId as string) ?? null;
    return { trackId, raw };
  }

  /** Paso 6: consulta el estado/acuse de un envío por TrackId. */
  async queryStatus(trackId: string, token: string): Promise<DgiiStatusResult> {
    const url = `${this.config.endpoints.consultaEstado}?trackid=${encodeURIComponent(trackId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: this.signal(),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`DGII consulta de estado: HTTP ${res.status}`);
    const estado = (raw.estado as string) ?? (raw.Estado as string) ?? null;
    return { estado, raw };
  }
}
