import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  SignatureProviderFactory,
  type SignatureProvider,
  type SignatureProviderName,
} from '@legalflow/compliance';
import { STORAGE_PROVIDER, type StorageProvider } from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  MAIL_PROVIDER,
  signatureRequestMessage,
  type MailProvider,
} from '../auth/mail/mail.provider';
import { DocumentsService } from '../documents/documents.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import type { RequestSignatureDto } from './dto/request-signature.dto';

/** Estados terminales: cierran la solicitud (sellan `completedAt`). */
const TERMINAL = new Set(['SIGNED', 'DECLINED', 'EXPIRED', 'CANCELED']);

@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  /**
   * Proveedor de firma configurado (Signaturit por defecto). Sin `SIGNATURIT_API_KEY` el adaptador no
   * transmite (devuelve `STUBBED`); con ella, transmite de verdad. Ver `@legalflow/compliance`
   * signature.interface.ts.
   */
  private readonly provider: SignatureProvider = SignatureProviderFactory.get(
    (process.env.SIGNATURE_PROVIDER as SignatureProviderName | undefined) ?? 'signaturit',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /** Inicia una solicitud de firma sobre una versión de documento del tenant. */
  async request(user: RequestUser, dto: RequestSignatureDto) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: dto.versionId, tenantId: user.tenantId },
      include: { document: { select: { id: true, name: true, matterId: true } } },
    });
    if (!version) throw new NotFoundException(apiError('documents.versionNotFound'));
    const documentBuffer = await this.storage.get(version.storageKey);

    const result = await this.provider.requestSignature({
      reference: version.id,
      documentName: version.document.name,
      signerName: dto.signerName,
      signerEmail: dto.signerEmail,
      documentBuffer,
      documentMimeType: version.mimeType,
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
        // L-9 (CWE-639): nunca persistir un externalId vacío. El webhook resuelve el tenant por
        // externalId; dos filas con '' podrían colisionar entre despachos. Si el proveedor no devuelve
        // uno (p. ej. adaptador STUBBED, que no transmite ni recibe webhooks), generamos un sentinel
        // local único que no puede casar con un externalId real del proveedor.
        externalId: result.externalId || `local-${randomBytes(12).toString('hex')}`,
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

    // Avisa al firmante por correo (fail-soft: un fallo de envío no debe romper la solicitud creada).
    if (signature.signUrl) {
      try {
        const tenant = await this.prisma.tenant.findFirst({ where: { id: user.tenantId } });
        await this.mail.sendMail(
          signatureRequestMessage(dto.signerEmail, {
            signerName: dto.signerName,
            documentName: version.document.name,
            firmName: tenant?.name ?? 'Lawzora',
            signUrl: signature.signUrl,
          }),
        );
      } catch (err) {
        this.logger.error('Fallo al enviar la solicitud de firma por correo', err as Error);
      }
    }
    return signature;
  }

  /**
   * Envía un CONJUNTO de versiones a firma (mismo firmante). Reutiliza `request` por versión, así que
   * cada una crea su propia SignatureRequest y pasa por el mismo adaptador. Las versiones que fallen no
   * abortan el resto: se devuelven los aciertos y la lista de errores.
   */
  async requestBatch(
    user: RequestUser,
    dto: { versionIds: string[]; signerName: string; signerEmail: string },
  ) {
    const unique = [...new Set(dto.versionIds)];
    const created = [];
    const failed: { versionId: string }[] = [];
    for (const versionId of unique) {
      try {
        const sig = await this.request(user, {
          versionId,
          signerName: dto.signerName,
          signerEmail: dto.signerEmail,
        });
        created.push(sig);
      } catch {
        failed.push({ versionId });
      }
    }
    await this.audit.log(user, 'signature.requested_batch', 'SignatureRequest', user.tenantId, {
      requested: unique.length,
      created: created.length,
    });
    return { created: created.length, failed: failed.length, signatures: created };
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
   * firma HMAC del cuerpo crudo y aplica el cambio de estado. Idempotente: re-aplicar el mismo estado
   * no rompe.
   *
   * SEGURIDAD (D4-001): el `tenantId` NO se toma del payload del evento. El HMAC usa un secreto global
   * compartido, así que si se filtra, un atacante podría forjar un webhook con el `tenantId` de otro
   * despacho y forzar un cambio de estado de firma cross-tenant. En su lugar resolvemos el tenant desde
   * la fila LOCAL `SignatureRequest` cuyo `externalId` coincide (consulta de SISTEMA, sin contexto de
   * tenant, igual que inbound-email): el `externalId` lo emitió este backend y referencia un despacho
   * concreto. Si no hay fila que coincida, se rechaza (no se procesa nada).
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.SIGNATURE_WEBHOOK_SECRET;
    const body = rawBody ? rawBody.toString('utf8') : '';
    if (!this.provider.verifyWebhook(body, signature, secret)) {
      throw new BadRequestException(apiError('signatures.webhookInvalid'));
    }
    const event = this.provider.parseWebhook(body);
    if (!event) throw new BadRequestException(apiError('signatures.webhookInvalid'));
    // L-9: defensa en profundidad — un externalId vacío jamás debe usarse para resolver el tenant.
    if (!event.externalId) throw new BadRequestException(apiError('signatures.webhookInvalid'));

    // El tenant se deriva de la fila local por `externalId`, nunca del payload (ver D4-001 arriba).
    const owner = await this.system.signatureRequest.findFirst({
      where: { externalId: event.externalId },
      select: { tenantId: true },
    });
    if (!owner) throw new BadRequestException(apiError('signatures.webhookInvalid'));
    const tenantId = owner.tenantId;

    await runWithTenant(tenantId, async () => {
      // Idempotencia: si el proveedor reenvía el mismo evento (reintento de webhook), las filas que YA
      // están en este estado no deben volver a descargarse/auditarse/notificarse.
      const before = await this.prisma.signatureRequest.findMany({
        where: { tenantId, externalId: event.externalId },
      });
      const newlyChanged = before.filter((s) => s.status !== event.status);

      await this.prisma.signatureRequest.updateMany({
        where: { tenantId, externalId: event.externalId },
        data: {
          status: event.status,
          detail: event.detail ?? null,
          ...(TERMINAL.has(event.status) ? { completedAt: new Date() } : {}),
        },
      });

      if (event.status === 'SIGNED' && newlyChanged.length > 0) {
        const signedDoc = await this.provider.downloadSignedDocument(event.externalId);
        for (const s of newlyChanged) {
          if (signedDoc) {
            try {
              const version = await this.documents.addSignedVersion(
                tenantId,
                s.documentId,
                s.requestedById,
                {
                  originalname: `${s.signerName}-firmado.pdf`,
                  mimetype: signedDoc.mimeType,
                  size: signedDoc.buffer.length,
                  buffer: signedDoc.buffer,
                },
              );
              await this.audit.log(
                { tenantId, userId: s.requestedById },
                'signature.document_signed',
                'DocumentVersion',
                version.id,
                { documentId: s.documentId, signatureId: s.id, contentHash: version.contentHash },
              );
            } catch (err) {
              this.logger.error(
                'Fallo al guardar el documento firmado como nueva versión',
                err as Error,
              );
            }
          }
          // Avisa al solicitante cuando el documento queda firmado.
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
