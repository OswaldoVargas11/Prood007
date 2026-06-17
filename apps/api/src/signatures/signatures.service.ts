import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SignatureProviderFactory,
  type SignatureProvider,
  type SignatureProviderName,
} from '@legalflow/compliance';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import type { RequestSignatureDto } from './dto/request-signature.dto';

/** Estados terminales: cierran la solicitud (sellan `completedAt`). */
const TERMINAL = new Set(['SIGNED', 'DECLINED', 'EXPIRED', 'CANCELED']);

@Injectable()
export class SignaturesService {
  /**
   * Proveedor de firma configurado (Signaturit por defecto). El adaptador está LISTO pero no
   * transmite (devuelve `STUBBED`); ver `@legalflow/compliance` signature.interface.ts.
   */
  private readonly provider: SignatureProvider = SignatureProviderFactory.get(
    (process.env.SIGNATURE_PROVIDER as SignatureProviderName | undefined) ?? 'signaturit',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Inicia una solicitud de firma sobre una versión de documento del tenant. */
  async request(user: RequestUser, dto: RequestSignatureDto) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: dto.versionId, tenantId: user.tenantId },
      include: { document: { select: { id: true, name: true, matterId: true } } },
    });
    if (!version) throw new NotFoundException(apiError('documents.versionNotFound'));

    const result = await this.provider.requestSignature({
      reference: version.id,
      documentName: version.document.name,
      signerName: dto.signerName,
      signerEmail: dto.signerEmail,
    });
    // STUBBED = adaptador no transmite; la solicitud queda creada como PENDING (a la espera de firma).
    const status = result.status === 'STUBBED' ? 'PENDING' : result.status;

    const signature = await this.prisma.signatureRequest.create({
      data: {
        tenantId: user.tenantId,
        documentId: version.document.id,
        versionId: version.id,
        matterId: version.document.matterId,
        provider: this.provider.provider.toLowerCase(),
        externalId: result.externalId ?? '',
        status,
        signerName: dto.signerName,
        signerEmail: dto.signerEmail,
        signUrl: result.signUrl ?? null,
        detail: result.detail ?? null,
        requestedById: user.userId,
      },
    });
    await this.audit.log(user, 'signature.requested', 'SignatureRequest', signature.id, {
      versionId: version.id,
      externalId: signature.externalId,
      provider: signature.provider,
    });
    return signature;
  }

  async listByDocument(user: RequestUser, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!document) throw new NotFoundException(apiError('documents.notFound'));
    return this.prisma.signatureRequest.findMany({
      where: { tenantId: user.tenantId, documentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listByMatter(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
    return this.prisma.signatureRequest.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Cancela una solicitud en curso (no transmite a Signaturit; refleja la cancelación localmente). */
  async cancel(user: RequestUser, id: string) {
    const signature = await this.prisma.signatureRequest.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!signature) throw new NotFoundException(apiError('signatures.notFound'));
    if (signature.status === 'SIGNED' || signature.status === 'CANCELED') {
      throw new BadRequestException(apiError('signatures.notCancelable'));
    }
    const result = await this.provider.cancel(signature.externalId);
    const updated = await this.prisma.signatureRequest.update({
      where: { id: signature.id },
      data: { status: 'CANCELED', detail: result.detail ?? null, completedAt: new Date() },
    });
    await this.audit.log(user, 'signature.canceled', 'SignatureRequest', signature.id, {
      externalId: signature.externalId,
    });
    return updated;
  }

  /**
   * Procesa un webhook del proveedor. Ruta PÚBLICA (la llama Signaturit, no un usuario): verifica la
   * firma HMAC del cuerpo crudo y aplica el cambio de estado bajo el tenant que viaja en el evento
   * verificado (igual que el webhook de cobros). Idempotente: re-aplicar el mismo estado no rompe.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.SIGNATURE_WEBHOOK_SECRET;
    const body = rawBody ? rawBody.toString('utf8') : '';
    if (!this.provider.verifyWebhook(body, signature, secret)) {
      throw new BadRequestException(apiError('signatures.webhookInvalid'));
    }
    const event = this.provider.parseWebhook(body);
    if (!event) throw new BadRequestException(apiError('signatures.webhookInvalid'));

    await runWithTenant(event.tenantId, async () => {
      await this.prisma.signatureRequest.updateMany({
        where: { tenantId: event.tenantId, externalId: event.externalId },
        data: {
          status: event.status,
          detail: event.detail ?? null,
          ...(TERMINAL.has(event.status) ? { completedAt: new Date() } : {}),
        },
      });

      // Avisa al solicitante cuando el documento queda firmado.
      if (event.status === 'SIGNED') {
        const affected = await this.prisma.signatureRequest.findMany({
          where: { tenantId: event.tenantId, externalId: event.externalId },
        });
        for (const s of affected) {
          await this.notifications.create({
            tenantId: s.tenantId,
            userId: s.requestedById,
            type: 'signature.signed',
            title: `Documento firmado por ${s.signerName}`,
            data: { documentId: s.documentId, versionId: s.versionId, signatureId: s.id },
          });
        }
      }
    });
    return { received: true };
  }
}
