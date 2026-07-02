import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EcfStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { apiError } from '../common/api-messages';
import { appendFiscalEvent } from '../ledger/fiscal-chain';
import { DgiiConfig } from './dgii.config';
import { DgiiSubmissionService, type DgiiStatus } from './dgii-submission.service';
import { DgiiCredentialService } from './dgii-credential.service';

/** Extrae el XML del e-CF del registro fiscal opaco (`Invoice.complianceRecord = { ecfXml }`). */
function extractEcfXml(record: unknown): string | null {
  if (record && typeof record === 'object' && 'ecfXml' in record) {
    const x = (record as { ecfXml?: unknown }).ecfXml;
    return typeof x === 'string' ? x : null;
  }
  return null;
}

function toEcfStatus(s: DgiiStatus): EcfStatus {
  return EcfStatus[s];
}

/** Evento fiscal a encadenar junto con la actualización de estado (append-only, misma transacción). */
interface EcfFiscalEvent {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Transmisión del e-CF de una factura a la DGII y consulta de su acuse, persistiendo el estado en la
 * factura (`ecfStatus`/`ecfTrackId`/`ecfAttempts`/…) y cada intento/acuse en la cadena fiscal inmutable
 * (FiscalEvent). GATED: si la transmisión está apagada (sin DGII_ENV) o el despacho no tiene certificado,
 * deja la factura en STUBBED sin transmitir. Nunca rompe: envuelve los errores.
 *
 * Fases y contador (`ecfAttempts`, lo consume el cron de reintento):
 *  - ENVÍO: sin TrackId. Cada intento fallido de transporte suma 1; al conseguir TrackId se resetea a 0.
 *  - ACUSE: con TrackId. Cada consulta que sigue en trámite suma 1; ACCEPTED/REJECTED resetea a 0.
 *
 * Idempotencia: una factura ACCEPTED nunca se retransmite; con envío en trámite (PENDING + TrackId),
 * `transmit` NO reenvía el e-CF (evita duplicar el comprobante en la DGII), consulta el acuse.
 */
@Injectable()
export class EcfTransmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DgiiConfig,
    private readonly submission: DgiiSubmissionService,
    private readonly credentials: DgiiCredentialService,
  ) {}

  /**
   * Persiste estado + contador y, si procede, encadena el evento fiscal en la MISMA transacción, bajo el
   * advisory lock de emisión por tenant (espacio 2): dos appends concurrentes (emisión vs cron) leerían
   * la misma huella previa y bifurcarían la cadena de eventos.
   */
  private async persist(
    tenantId: string,
    invoiceId: string,
    data: { status: EcfStatus; detail: string | null; trackId?: string | null; attempts?: number },
    event?: EcfFiscalEvent,
  ): Promise<void> {
    const update = {
      ecfStatus: data.status,
      ecfStatusDetail: data.detail,
      ...(data.trackId ? { ecfTrackId: data.trackId } : {}),
      ...(data.attempts !== undefined ? { ecfAttempts: data.attempts } : {}),
      ecfSubmittedAt: new Date(),
    };
    if (!event) {
      await this.prisma.invoice.updateMany({ where: { id: invoiceId, tenantId }, data: update });
      return;
    }
    await tenantTransaction(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${tenantId}))`;
      await tx.invoice.updateMany({ where: { id: invoiceId, tenantId }, data: update });
      await appendFiscalEvent(tx, tenantId, invoiceId, event.type, event.payload);
    });
  }

  /**
   * Firma y transmite el e-CF de una factura DO. Best-effort: un fallo de transporte deja la factura en
   * PENDING sin TrackId (con el intento contado) para que el cron la reintente con backoff.
   */
  async transmit(
    tenantId: string,
    invoiceId: string,
  ): Promise<{ status: EcfStatus; detail?: string; trackId?: string | null }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        id: true,
        number: true,
        complianceFormat: true,
        complianceRecord: true,
        ecfStatus: true,
        ecfTrackId: true,
        ecfAttempts: true,
      },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    if (invoice.complianceFormat !== 'ECF') {
      return { status: EcfStatus.NOT_APPLICABLE };
    }
    // Idempotencia: un e-CF aceptado por la DGII nunca se reenvía; uno en trámite (ya con TrackId)
    // tampoco — reenviarlo duplicaría el comprobante. En trámite, lo que toca es consultar el acuse.
    if (invoice.ecfStatus === EcfStatus.ACCEPTED) {
      return { status: EcfStatus.ACCEPTED, trackId: invoice.ecfTrackId };
    }
    if (invoice.ecfStatus === EcfStatus.PENDING && invoice.ecfTrackId) {
      return this.refresh(tenantId, invoiceId);
    }

    const ecfXml = extractEcfXml(invoice.complianceRecord);
    if (!ecfXml) {
      const detail = 'La factura no tiene un e-CF XML.';
      await this.persist(
        tenantId,
        invoiceId,
        { status: EcfStatus.REJECTED, detail, attempts: 0 },
        { type: 'ecf.rejected', payload: { number: invoice.number, detail } },
      );
      return { status: EcfStatus.REJECTED, detail };
    }

    const cert = await this.credentials.getCert(tenantId);
    if (!this.config.enabled || !cert) {
      const detail = !this.config.enabled
        ? 'Transmisión a la DGII apagada (define DGII_ENV).'
        : 'El despacho no tiene certificado .p12 cargado.';
      // Comportamiento actual sin DGII_ENV: STUBBED, sin evento (no hubo intento de transmisión).
      await this.persist(tenantId, invoiceId, { status: EcfStatus.STUBBED, detail });
      return { status: EcfStatus.STUBBED, detail };
    }

    const result = await this.submission.submit(ecfXml, cert);
    const status = toEcfStatus(result.status);
    const detail = result.detail ?? null;
    if (status === EcfStatus.PENDING && result.externalId) {
      // Enviado con éxito: arranca la fase de acuse (contador a 0). Intento registrado en la cadena.
      await this.persist(
        tenantId,
        invoiceId,
        { status, detail, trackId: result.externalId, attempts: 0 },
        {
          type: 'ecf.transmitted',
          payload: { number: invoice.number, trackId: result.externalId, env: this.config.env },
        },
      );
    } else if (status === EcfStatus.PENDING) {
      // Fallo de transporte: intento contado (backoff/tope del cron) y registrado en la cadena.
      const attempt = invoice.ecfAttempts + 1;
      await this.persist(
        tenantId,
        invoiceId,
        { status, detail, attempts: attempt },
        {
          type: 'ecf.transmit_failed',
          payload: { number: invoice.number, attempt, detail, env: this.config.env },
        },
      );
    } else {
      // Estado final síncrono (poco habitual): acuse registrado en la cadena.
      await this.persist(
        tenantId,
        invoiceId,
        { status, detail, trackId: result.externalId ?? null, attempts: 0 },
        {
          type: status === EcfStatus.ACCEPTED ? 'ecf.accepted' : 'ecf.rejected',
          payload: {
            number: invoice.number,
            trackId: result.externalId ?? null,
            detail,
            env: this.config.env,
          },
        },
      );
    }
    return { status, detail: result.detail, trackId: result.externalId ?? null };
  }

  /** Consulta el acuse/estado en la DGII por el TrackId guardado y actualiza la factura. */
  async refresh(
    tenantId: string,
    invoiceId: string,
  ): Promise<{ status: EcfStatus; detail?: string; trackId?: string | null }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { number: true, ecfTrackId: true, ecfStatus: true, ecfAttempts: true },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    if (!invoice.ecfTrackId) {
      throw new BadRequestException('La factura no tiene TrackId de la DGII; transmítela primero.');
    }
    // Acuse final ya persistido: no hay nada que consultar (idempotencia del polling).
    if (invoice.ecfStatus === EcfStatus.ACCEPTED) {
      return { status: EcfStatus.ACCEPTED, trackId: invoice.ecfTrackId };
    }
    const cert = await this.credentials.getCert(tenantId);
    if (!this.config.enabled || !cert) {
      return { status: invoice.ecfStatus, trackId: invoice.ecfTrackId };
    }
    const result = await this.submission.getStatus(invoice.ecfTrackId, cert);
    const status = toEcfStatus(result.status);
    const detail = result.detail ?? null;
    if (status === EcfStatus.ACCEPTED || status === EcfStatus.REJECTED) {
      // Acuse FINAL de la DGII: estado persistido + evento en la cadena fiscal inmutable.
      await this.persist(
        tenantId,
        invoiceId,
        { status, detail, trackId: invoice.ecfTrackId, attempts: 0 },
        {
          type: status === EcfStatus.ACCEPTED ? 'ecf.accepted' : 'ecf.rejected',
          payload: {
            number: invoice.number,
            trackId: invoice.ecfTrackId,
            detail,
            env: this.config.env,
          },
        },
      );
    } else {
      // Sigue en trámite (o error transitorio consultando): consulta contada para el tope del cron,
      // sin evento (el acuse aún no existe; evitamos ruido en la cadena).
      await this.persist(tenantId, invoiceId, {
        status: EcfStatus.PENDING,
        detail,
        trackId: invoice.ecfTrackId,
        attempts: invoice.ecfAttempts + 1,
      });
    }
    return { status, detail: result.detail, trackId: invoice.ecfTrackId };
  }

  /**
   * Cierre por agotamiento del cron de reintento (tope de intentos automáticos):
   *  - Fase de ENVÍO (sin TrackId): la DGII nunca recibió el e-CF → REJECTED con causa clara, registrado
   *    en la cadena. El despacho puede reintentar manualmente ("Transmitir") o emitir rectificativa.
   *  - Fase de ACUSE (con TrackId): NO es un rechazo (el envío existe en la DGII) → queda PENDING con
   *    nota para consulta manual; el contador avanza para que el cron deje de insistir.
   */
  async markRetryExhausted(tenantId: string, invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { number: true, ecfStatus: true, ecfTrackId: true, ecfAttempts: true },
    });
    if (!invoice || invoice.ecfStatus !== EcfStatus.PENDING) return;
    if (invoice.ecfTrackId) {
      await this.persist(tenantId, invoiceId, {
        status: EcfStatus.PENDING,
        detail: `Acuse sin resolver tras ${invoice.ecfAttempts} consultas automáticas; usa "Consultar acuse" o verifica el TrackId en la Oficina Virtual de la DGII.`,
        trackId: invoice.ecfTrackId,
        attempts: invoice.ecfAttempts + 1,
      });
      return;
    }
    const detail = `No se pudo transmitir a la DGII tras ${invoice.ecfAttempts} intentos automáticos. Reintenta manualmente o emite una rectificativa.`;
    await this.persist(
      tenantId,
      invoiceId,
      { status: EcfStatus.REJECTED, detail, attempts: invoice.ecfAttempts },
      {
        type: 'ecf.retry_exhausted',
        payload: { number: invoice.number, attempts: invoice.ecfAttempts, detail },
      },
    );
  }
}
