import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { STORAGE_PROVIDER, type StorageProvider } from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import {
  AnswerQuestionDto,
  AskQuestionDto,
  CreateDataRoomDto,
  CreateFolderDto,
  CreateGrantDto,
  LinkDocumentDto,
} from './dto/data-room.dto';
import { watermarkPdf } from './watermark';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Data room de due diligence. Las rutas INTERNAS (staff) usan el cliente con RLS; las rutas EXTERNAS
 * (enlace mágico de la contraparte, SIN sesión) usan el cliente de sistema (BYPASSRLS) y se acotan
 * manualmente por el dataRoomId que resuelve el token. La fuente de verdad de los ficheros es el
 * StorageProvider cifrado.
 */
@Injectable()
export class DataRoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  // ── Internas (staff, RLS) ──────────────────────────────────────────────────

  private async assertMatterInTenant(user: RequestUser, matterId: string): Promise<void> {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notInFirm'));
  }

  private async getRoomOrThrow(user: RequestUser, id: string) {
    const room = await this.prisma.dataRoom.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, matterId: true, name: true, watermark: true, status: true },
    });
    if (!room) throw new NotFoundException(apiError('dataRoom.notFound'));
    return room;
  }

  async create(user: RequestUser, dto: CreateDataRoomDto) {
    await this.assertMatterInTenant(user, dto.matterId);
    const room = await this.prisma.dataRoom.create({
      data: {
        tenantId: user.tenantId,
        matterId: dto.matterId,
        name: dto.name.trim(),
        watermark: dto.watermark ?? true,
      },
      select: { id: true },
    });
    await this.audit.log(user, 'dataroom.created', 'DataRoom', room.id, { matterId: dto.matterId });
    return this.getOne(user, room.id);
  }

  async listByMatter(user: RequestUser, matterId: string) {
    await this.assertMatterInTenant(user, matterId);
    const rooms = await this.prisma.dataRoom.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        watermark: true,
        createdAt: true,
        _count: { select: { documents: true, grants: true, questions: true } },
      },
    });
    return rooms;
  }

  async getOne(user: RequestUser, id: string) {
    const room = await this.prisma.dataRoom.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        matterId: true,
        name: true,
        watermark: true,
        status: true,
        folders: {
          select: { id: true, name: true, parentId: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
        documents: {
          select: {
            id: true,
            name: true,
            folderId: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        grants: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            canDownload: true,
            folderIds: true,
            expiresAt: true,
            revokedAt: true,
            lastAccessAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!room) throw new NotFoundException(apiError('dataRoom.notFound'));
    return room;
  }

  async update(
    user: RequestUser,
    id: string,
    dto: { name?: string; watermark?: boolean; status?: string },
  ) {
    await this.getRoomOrThrow(user, id);
    await this.prisma.dataRoom.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.watermark !== undefined ? { watermark: dto.watermark } : {}),
        ...(dto.status === 'OPEN' || dto.status === 'CLOSED' ? { status: dto.status } : {}),
      },
    });
    return this.getOne(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.dataRoom.deleteMany({ where: { id, tenantId: user.tenantId } });
    if (res.count === 0) throw new NotFoundException(apiError('dataRoom.notFound'));
    await this.audit.log(user, 'dataroom.deleted', 'DataRoom', id);
    return { success: true };
  }

  async addFolder(user: RequestUser, roomId: string, dto: CreateFolderDto) {
    await this.getRoomOrThrow(user, roomId);
    const last = await this.prisma.dataRoomFolder.findFirst({
      where: { dataRoomId: roomId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await this.prisma.dataRoomFolder.create({
      data: {
        tenantId: user.tenantId,
        dataRoomId: roomId,
        name: dto.name.trim(),
        parentId: dto.parentId || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.getOne(user, roomId);
  }

  async removeFolder(user: RequestUser, folderId: string) {
    const folder = await this.prisma.dataRoomFolder.findFirst({
      where: { id: folderId, tenantId: user.tenantId },
      select: { dataRoomId: true },
    });
    if (!folder) throw new NotFoundException(apiError('dataRoom.folderNotFound'));
    await this.prisma.dataRoomFolder.deleteMany({
      where: { id: folderId, tenantId: user.tenantId },
    });
    return this.getOne(user, folder.dataRoomId);
  }

  /** Vincula una versión del expediente al data room reutilizando su clave de almacenamiento (espejo). */
  async linkDocument(user: RequestUser, roomId: string, dto: LinkDocumentDto) {
    await this.getRoomOrThrow(user, roomId);
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: dto.versionId, tenantId: user.tenantId },
      select: {
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
        contentHash: true,
        document: { select: { name: true } },
      },
    });
    if (!version) throw new NotFoundException(apiError('documents.versionNotFound'));
    if (dto.folderId) await this.assertFolderInRoom(user, roomId, dto.folderId);
    await this.prisma.dataRoomDocument.create({
      data: {
        tenantId: user.tenantId,
        dataRoomId: roomId,
        folderId: dto.folderId || null,
        name: dto.name?.trim() || version.document.name,
        sourceVersionId: dto.versionId,
        storageKey: version.storageKey,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        contentHash: version.contentHash,
        uploadedById: user.userId,
      },
    });
    return this.getOne(user, roomId);
  }

  async uploadDocument(
    user: RequestUser,
    roomId: string,
    folderId: string | undefined,
    name: string | undefined,
    file?: UploadedFile,
  ) {
    if (!file) throw new BadRequestException(apiError('documents.fileMissing'));
    await this.getRoomOrThrow(user, roomId);
    if (folderId) await this.assertFolderInRoom(user, roomId, folderId);
    const created = await this.prisma.dataRoomDocument.create({
      data: {
        tenantId: user.tenantId,
        dataRoomId: roomId,
        folderId: folderId || null,
        name: name?.trim() || file.originalname,
        storageKey: '',
        mimeType: file.mimetype,
        sizeBytes: file.size,
        contentHash: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedById: user.userId,
      },
      select: { id: true },
    });
    const key = `${user.tenantId}/datarooms/${roomId}/${created.id}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.prisma.dataRoomDocument.updateMany({
      where: { id: created.id, tenantId: user.tenantId },
      data: { storageKey: key },
    });
    return this.getOne(user, roomId);
  }

  async removeDocument(user: RequestUser, docId: string) {
    const doc = await this.prisma.dataRoomDocument.findFirst({
      where: { id: docId, tenantId: user.tenantId },
      select: { dataRoomId: true },
    });
    if (!doc) throw new NotFoundException(apiError('dataRoom.documentNotFound'));
    await this.prisma.dataRoomDocument.deleteMany({
      where: { id: docId, tenantId: user.tenantId },
    });
    return this.getOne(user, doc.dataRoomId);
  }

  private async assertFolderInRoom(
    user: RequestUser,
    roomId: string,
    folderId: string,
  ): Promise<void> {
    const folder = await this.prisma.dataRoomFolder.findFirst({
      where: { id: folderId, dataRoomId: roomId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!folder) throw new BadRequestException(apiError('dataRoom.folderNotFound'));
  }

  /** Descarga interna (staff): el original, sin marca de agua. */
  async downloadInternal(user: RequestUser, docId: string) {
    const doc = await this.prisma.dataRoomDocument.findFirst({
      where: { id: docId, tenantId: user.tenantId },
      select: { name: true, mimeType: true, storageKey: true },
    });
    if (!doc) throw new NotFoundException(apiError('dataRoom.documentNotFound'));
    const buffer = await this.storage.get(doc.storageKey);
    return { name: doc.name, mimeType: doc.mimeType, buffer };
  }

  /** Crea un enlace mágico para un externo. Devuelve el token EN CLARO una sola vez. */
  async createGrant(user: RequestUser, roomId: string, dto: CreateGrantDto) {
    await this.getRoomOrThrow(user, roomId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    const grant = await this.prisma.dataRoomGrant.create({
      data: {
        tenantId: user.tenantId,
        dataRoomId: roomId,
        email: dto.email.trim().toLowerCase(),
        name: dto.name?.trim() || null,
        tokenHash: this.sha256(token),
        canDownload: dto.canDownload ?? true,
        folderIds: dto.folderIds ?? [],
        expiresAt,
        createdById: user.userId,
      },
      select: { id: true, email: true },
    });
    await this.audit.log(user, 'dataroom.grant_created', 'DataRoomGrant', grant.id, {
      dataRoomId: roomId,
      email: grant.email,
    });
    return { id: grant.id, email: grant.email, token };
  }

  async revokeGrant(user: RequestUser, grantId: string) {
    const grant = await this.prisma.dataRoomGrant.findFirst({
      where: { id: grantId, tenantId: user.tenantId },
      select: { dataRoomId: true },
    });
    if (!grant) throw new NotFoundException(apiError('dataRoom.grantNotFound'));
    await this.prisma.dataRoomGrant.updateMany({
      where: { id: grantId, tenantId: user.tenantId },
      data: { revokedAt: new Date() },
    });
    await this.audit.log(user, 'dataroom.grant_revoked', 'DataRoomGrant', grantId);
    return this.getOne(user, grant.dataRoomId);
  }

  async listAccessLog(user: RequestUser, roomId: string) {
    await this.getRoomOrThrow(user, roomId);
    return this.prisma.dataRoomAccessLog.findMany({
      where: { dataRoomId: roomId, tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        actorEmail: true,
        action: true,
        targetId: true,
        ip: true,
        createdAt: true,
      },
    });
  }

  async listQuestions(user: RequestUser, roomId: string) {
    await this.getRoomOrThrow(user, roomId);
    return this.prisma.dataRoomQuestion.findMany({
      where: { dataRoomId: roomId, tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        askedByEmail: true,
        body: true,
        answer: true,
        status: true,
        documentId: true,
        folderId: true,
        createdAt: true,
        answeredAt: true,
      },
    });
  }

  async answerQuestion(user: RequestUser, questionId: string, dto: AnswerQuestionDto) {
    const q = await this.prisma.dataRoomQuestion.findFirst({
      where: { id: questionId, tenantId: user.tenantId },
      select: { dataRoomId: true },
    });
    if (!q) throw new NotFoundException(apiError('dataRoom.questionNotFound'));
    await this.prisma.dataRoomQuestion.updateMany({
      where: { id: questionId, tenantId: user.tenantId },
      data: {
        answer: dto.answer.trim(),
        answeredById: user.userId,
        answeredAt: new Date(),
        status: 'ANSWERED',
      },
    });
    return this.listQuestions(user, q.dataRoomId);
  }

  // ── Externas (enlace mágico, SIN sesión → cliente de sistema) ────────────────

  /** Resuelve un token de enlace mágico → grant + room. Lanza si es inválido/revocado/expirado. */
  private async resolveGrant(token: string) {
    const grant = await this.system.dataRoomGrant.findUnique({
      where: { tokenHash: this.sha256(token) },
      select: {
        id: true,
        email: true,
        name: true,
        canDownload: true,
        folderIds: true,
        revokedAt: true,
        expiresAt: true,
        dataRoom: {
          select: { id: true, tenantId: true, name: true, watermark: true, status: true },
        },
      },
    });
    if (!grant || grant.revokedAt) throw new NotFoundException(apiError('dataRoom.linkInvalid'));
    if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException(apiError('dataRoom.linkExpired'));
    }
    if (grant.dataRoom.status === 'CLOSED') {
      throw new ForbiddenException(apiError('dataRoom.closed'));
    }
    return grant;
  }

  private folderAllowed(folderIds: string[], folderId: string | null): boolean {
    if (folderIds.length === 0) return true; // sin restricción = todo el data room
    return folderId !== null && folderIds.includes(folderId);
  }

  private async logExternal(
    tenantId: string,
    dataRoomId: string,
    grantId: string | null,
    actorEmail: string,
    action: string,
    targetId: string | null,
    ip?: string,
  ): Promise<void> {
    await this.system.dataRoomAccessLog
      .create({ data: { tenantId, dataRoomId, grantId, actorEmail, action, targetId, ip } })
      .catch(() => undefined);
  }

  /** Vista del data room para el externo (filtrada por sus carpetas permitidas). Registra el acceso. */
  async externalRoom(token: string, ip?: string) {
    const grant = await this.resolveGrant(token);
    const room = grant.dataRoom;

    await this.system.dataRoomGrant
      .update({ where: { id: grant.id }, data: { lastAccessAt: new Date() } })
      .catch(() => undefined);
    await this.logExternal(room.tenantId, room.id, grant.id, grant.email, 'VIEW_ROOM', null, ip);

    const folders = await this.system.dataRoomFolder.findMany({
      where: { dataRoomId: room.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, parentId: true },
    });
    const documents = await this.system.dataRoomDocument.findMany({
      where: { dataRoomId: room.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, folderId: true, mimeType: true, sizeBytes: true },
    });

    const visibleFolders = folders.filter((f) => this.folderAllowed(grant.folderIds, f.id));
    const visibleFolderIds = new Set(visibleFolders.map((f) => f.id));
    const visibleDocs = documents.filter((d) => this.folderAllowed(grant.folderIds, d.folderId));

    return {
      name: room.name,
      viewer: { email: grant.email, name: grant.name },
      canDownload: grant.canDownload,
      watermark: room.watermark,
      folders: visibleFolders,
      documents: visibleDocs,
      // Carpetas raíz visibles (sin padre o cuyo padre no es visible) para construir el árbol.
      rootFolderIds: visibleFolders
        .filter((f) => !f.parentId || !visibleFolderIds.has(f.parentId))
        .map((f) => f.id),
    };
  }

  async externalDownload(token: string, docId: string, ip?: string) {
    const grant = await this.resolveGrant(token);
    if (!grant.canDownload) throw new ForbiddenException(apiError('dataRoom.downloadNotAllowed'));
    const room = grant.dataRoom;
    const doc = await this.system.dataRoomDocument.findFirst({
      where: { id: docId, dataRoomId: room.id },
      select: { name: true, mimeType: true, storageKey: true, folderId: true },
    });
    if (!doc || !this.folderAllowed(grant.folderIds, doc.folderId)) {
      throw new NotFoundException(apiError('dataRoom.documentNotFound'));
    }
    let buffer = await this.storage.get(doc.storageKey);
    if (room.watermark && doc.mimeType === 'application/pdf') {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      buffer = await watermarkPdf(buffer, `CONFIDENCIAL · ${grant.email} · ${stamp}`);
    }
    await this.logExternal(room.tenantId, room.id, grant.id, grant.email, 'DOWNLOAD', docId, ip);
    return { name: doc.name, mimeType: doc.mimeType, buffer };
  }

  async externalAsk(token: string, dto: AskQuestionDto, ip?: string) {
    const grant = await this.resolveGrant(token);
    const room = grant.dataRoom;
    if (dto.documentId) {
      const doc = await this.system.dataRoomDocument.findFirst({
        where: { id: dto.documentId, dataRoomId: room.id },
        select: { folderId: true },
      });
      if (!doc || !this.folderAllowed(grant.folderIds, doc.folderId)) {
        throw new NotFoundException(apiError('dataRoom.documentNotFound'));
      }
    }
    await this.system.dataRoomQuestion.create({
      data: {
        tenantId: room.tenantId,
        dataRoomId: room.id,
        grantId: grant.id,
        folderId: dto.folderId || null,
        documentId: dto.documentId || null,
        askedByEmail: grant.email,
        body: dto.body.trim(),
      },
    });
    await this.logExternal(room.tenantId, room.id, grant.id, grant.email, 'QUESTION', null, ip);
    return this.externalQuestions(token);
  }

  async externalQuestions(token: string) {
    const grant = await this.resolveGrant(token);
    const questions = await this.system.dataRoomQuestion.findMany({
      where: { dataRoomId: grant.dataRoom.id, grantId: grant.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        body: true,
        answer: true,
        status: true,
        documentId: true,
        createdAt: true,
        answeredAt: true,
      },
    });
    return { questions };
  }
}
