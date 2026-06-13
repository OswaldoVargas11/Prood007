import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentReviewStatus, Role, STORAGE_PROVIDER } from '@legalflow/domain';
import type { StorageProvider } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestUser } from '../auth/auth.types';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertMatterInTenant(user: RequestUser, matterId: string): Promise<void> {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new BadRequestException('El expediente no existe en este despacho.');
  }

  private storageKey(tenantId: string, documentId: string, version: number): string {
    return `${tenantId}/documents/${documentId}/v${version}`;
  }

  private async persistVersion(
    user: RequestUser,
    documentId: string,
    version: number,
    file: UploadedFile,
  ) {
    const key = this.storageKey(user.tenantId, documentId, version);
    await this.storage.put(key, file.buffer, file.mimetype);
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    return this.prisma.documentVersion.create({
      data: {
        tenantId: user.tenantId,
        documentId,
        version,
        storageKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        contentHash,
        reviewStatus: DocumentReviewStatus.PENDING,
        uploadedById: user.userId,
      },
    });
  }

  /** Sube un documento nuevo (crea el Document + versión 1). */
  async upload(user: RequestUser, matterId: string, name: string | undefined, file?: UploadedFile) {
    if (!file) throw new BadRequestException('Falta el archivo.');
    await this.assertMatterInTenant(user, matterId);

    const document = await this.prisma.document.create({
      data: { tenantId: user.tenantId, matterId, name: name?.trim() || file.originalname },
    });
    const version = await this.persistVersion(user, document.id, 1, file);
    await this.audit.log(user, 'document.uploaded', 'Document', document.id, { version: 1 });
    return { document, version };
  }

  /** Añade una nueva versión a un documento existente. */
  async addVersion(user: RequestUser, documentId: string, file?: UploadedFile) {
    if (!file) throw new BadRequestException('Falta el archivo.');
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!document) throw new NotFoundException('Documento no encontrado.');

    const last = await this.prisma.documentVersion.findFirst({
      where: { documentId, tenantId: user.tenantId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const next = (last?.version ?? 0) + 1;
    const version = await this.persistVersion(user, documentId, next, file);
    await this.audit.log(user, 'document.version_added', 'Document', documentId, { version: next });
    return version;
  }

  async listByMatter(user: RequestUser, matterId: string) {
    await this.assertMatterInTenant(user, matterId);
    return this.prisma.document.findMany({
      where: { tenantId: user.tenantId, matterId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, reviewStatus: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: RequestUser, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { versions: { orderBy: { version: 'desc' }, include: { reviews: true } } },
    });
    if (!document) throw new NotFoundException('Documento no encontrado.');
    return document;
  }

  /** Devuelve el contenido binario de una versión (tras verificar pertenencia al tenant). */
  async download(user: RequestUser, versionId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, tenantId: user.tenantId },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    const buffer = await this.storage.get(version.storageKey);
    return { version, buffer };
  }

  /** Revisa una versión (aprobar/rechazar/requiere cambios/en revisión). Solo abogados/admin. */
  async review(
    user: RequestUser,
    versionId: string,
    status: DocumentReviewStatus,
    comment?: string,
  ) {
    if (status === DocumentReviewStatus.PENDING) {
      throw new BadRequestException('PENDING no es un estado de revisión válido.');
    }
    if (!user.roles.includes(Role.LAWYER) && !user.roles.includes(Role.FIRM_ADMIN)) {
      throw new ForbiddenException('Solo abogados o administradores pueden revisar documentos.');
    }
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, tenantId: user.tenantId },
      include: { document: { select: { id: true, name: true, matterId: true } } },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');

    await this.prisma.$transaction([
      this.prisma.documentVersion.updateMany({
        where: { id: versionId, tenantId: user.tenantId },
        data: { reviewStatus: status },
      }),
      this.prisma.documentReview.create({
        data: { tenantId: user.tenantId, versionId, reviewerId: user.userId, status, comment },
      }),
    ]);

    // Notifica al autor de la versión (si no es el propio revisor).
    if (version.uploadedById !== user.userId) {
      await this.notifications.create({
        tenantId: user.tenantId,
        userId: version.uploadedById,
        type: 'document.review',
        title: `Documento "${version.document.name}" — ${status}`,
        body: comment,
        data: { documentId: version.document.id, versionId, status },
      });
    }
    await this.audit.log(user, 'document.reviewed', 'DocumentVersion', versionId, { status });
    return this.getOne(user, version.document.id);
  }
}
