import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EcfStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
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

/**
 * Transmisión del e-CF de una factura a la DGII y consulta de su acuse, persistiendo el estado en la
 * factura (`ecfStatus`/`ecfTrackId`/…). GATED: si la transmisión está apagada (sin DGII_ENV) o el despacho
 * no tiene certificado, deja la factura en STUBBED sin transmitir. Nunca rompe: envuelve los errores.
 */
@Injectable()
export class EcfTransmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DgiiConfig,
    private readonly submission: DgiiSubmissionService,
    private readonly credentials: DgiiCredentialService,
  ) {}

  private async update(
    tenantId: string,
    invoiceId: string,
    status: EcfStatus,
    detail: string | null,
    trackId: string | null,
  ): Promise<void> {
    await this.prisma.invoice.updateMany({
      where: { id: invoiceId, tenantId },
      data: {
        ecfStatus: status,
        ecfStatusDetail: detail,
        ...(trackId ? { ecfTrackId: trackId } : {}),
        ecfSubmittedAt: new Date(),
      },
    });
  }

  /** Firma y transmite el e-CF de una factura DO. Best-effort: deja el estado para reintento si falla. */
  async transmit(
    tenantId: string,
    invoiceId: string,
  ): Promise<{ status: EcfStatus; detail?: string; trackId?: string | null }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true, complianceFormat: true, complianceRecord: true },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    if (invoice.complianceFormat !== 'ECF') {
      return { status: EcfStatus.NOT_APPLICABLE };
    }

    const ecfXml = extractEcfXml(invoice.complianceRecord);
    if (!ecfXml) {
      await this.update(
        tenantId,
        invoiceId,
        EcfStatus.REJECTED,
        'La factura no tiene un e-CF XML.',
        null,
      );
      return { status: EcfStatus.REJECTED, detail: 'La factura no tiene un e-CF XML.' };
    }

    const cert = await this.credentials.getCert(tenantId);
    if (!this.config.enabled || !cert) {
      const detail = !this.config.enabled
        ? 'Transmisión a la DGII apagada (define DGII_ENV).'
        : 'El despacho no tiene certificado .p12 cargado.';
      await this.update(tenantId, invoiceId, EcfStatus.STUBBED, detail, null);
      return { status: EcfStatus.STUBBED, detail };
    }

    const result = await this.submission.submit(ecfXml, cert);
    const status = toEcfStatus(result.status);
    await this.update(
      tenantId,
      invoiceId,
      status,
      result.detail ?? null,
      result.externalId ?? null,
    );
    return { status, detail: result.detail, trackId: result.externalId ?? null };
  }

  /** Consulta el acuse/estado en la DGII por el TrackId guardado y actualiza la factura. */
  async refresh(
    tenantId: string,
    invoiceId: string,
  ): Promise<{ status: EcfStatus; detail?: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { ecfTrackId: true, ecfStatus: true },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    if (!invoice.ecfTrackId) {
      throw new BadRequestException('La factura no tiene TrackId de la DGII; transmítela primero.');
    }
    const cert = await this.credentials.getCert(tenantId);
    if (!this.config.enabled || !cert) {
      return { status: invoice.ecfStatus };
    }
    const result = await this.submission.getStatus(invoice.ecfTrackId, cert);
    const status = toEcfStatus(result.status);
    await this.update(tenantId, invoiceId, status, result.detail ?? null, invoice.ecfTrackId);
    return { status, detail: result.detail };
  }
}
