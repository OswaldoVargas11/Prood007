import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderKind } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/**
 * Sistema de ficheros (carpetas anidadas) del despacho. Dos contextos por `kind`:
 *  - DOCUMENT: carpetas de documentos de un expediente (matterId obligatorio).
 *  - TEMPLATE: carpetas de plantillas del despacho (sin expediente).
 * Tenant-scoped (filtro `tenantId` + RLS). Las operaciones de mover previenen ciclos.
 */
@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Carga una carpeta del tenant o lanza 404. */
  private async getOrThrow(user: RequestUser, id: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!folder) throw new NotFoundException(apiError('folders.notFound'));
    return folder;
  }

  /**
   * Comprueba que una carpeta candidata a padre es compatible: mismo tenant, mismo `kind` y, en
   * documentos, mismo `matterId`. Lanza si no encaja.
   */
  private async assertCompatibleParent(
    user: RequestUser,
    parentId: string,
    kind: FolderKind,
    matterId: string | null,
  ) {
    const parent = await this.prisma.folder.findFirst({
      where: { id: parentId, tenantId: user.tenantId },
      select: { id: true, kind: true, matterId: true },
    });
    if (!parent) throw new NotFoundException(apiError('folders.notFound'));
    if (parent.kind !== kind || (parent.matterId ?? null) !== (matterId ?? null)) {
      throw new BadRequestException(apiError('folders.parentMismatch'));
    }
  }

  /** Lista (plana) las carpetas de un contexto. El frontend reconstruye el árbol con `parentId`. */
  async list(user: RequestUser, kind: FolderKind, matterId?: string) {
    return this.prisma.folder.findMany({
      where: {
        tenantId: user.tenantId,
        kind,
        matterId: kind === FolderKind.DOCUMENT ? (matterId ?? undefined) : null,
      },
      select: { id: true, name: true, parentId: true, kind: true, matterId: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: RequestUser, dto: CreateFolderDto) {
    const matterId = dto.kind === FolderKind.DOCUMENT ? dto.matterId : undefined;
    if (dto.kind === FolderKind.DOCUMENT) {
      if (!matterId) throw new BadRequestException(apiError('folders.matterRequired'));
      const matter = await this.prisma.matter.findFirst({
        where: { id: matterId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
    }
    if (dto.parentId) {
      await this.assertCompatibleParent(user, dto.parentId, dto.kind, matterId ?? null);
    }
    const folder = await this.prisma.folder.create({
      data: {
        tenantId: user.tenantId,
        kind: dto.kind,
        matterId: matterId ?? null,
        parentId: dto.parentId ?? null,
        name: dto.name.trim(),
      },
    });
    await this.audit.log(user, 'folder.created', 'Folder', folder.id, { kind: dto.kind });
    return folder;
  }

  async update(user: RequestUser, id: string, dto: UpdateFolderDto) {
    const folder = await this.getOrThrow(user, id);

    // Mover: validar destino compatible y descartar ciclos (no a sí misma ni a un descendiente).
    if (dto.parentId !== undefined && (dto.parentId ?? null) !== folder.parentId) {
      const targetId = dto.parentId ?? null;
      if (targetId) {
        if (targetId === id) throw new BadRequestException(apiError('folders.cycle'));
        await this.assertCompatibleParent(
          user,
          targetId,
          folder.kind as FolderKind,
          folder.matterId,
        );
        if (await this.isDescendant(user, id, targetId)) {
          throw new BadRequestException(apiError('folders.cycle'));
        }
      }
    }

    const updated = await this.prisma.folder.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId ?? null } : {}),
      },
    });
    await this.audit.log(user, 'folder.updated', 'Folder', id);
    return updated;
  }

  /**
   * ¿`candidateId` es la propia carpeta `id` o un descendiente suyo? Sube por la cadena de padres
   * desde `candidateId` hasta la raíz buscando `id`. Acotado por tenant.
   */
  private async isDescendant(user: RequestUser, id: string, candidateId: string): Promise<boolean> {
    let cursor: string | null = candidateId;
    // Cota de seguridad por si hubiera datos inconsistentes.
    for (let i = 0; cursor && i < 100; i += 1) {
      if (cursor === id) return true;
      const node: { parentId: string | null } | null = await this.prisma.folder.findFirst({
        where: { id: cursor, tenantId: user.tenantId },
        select: { parentId: true },
      });
      cursor = node?.parentId ?? null;
    }
    return false;
  }

  /**
   * Borra una carpeta. Para NO perder contenido, reubica al padre de la carpeta borrada tanto sus
   * subcarpetas como los documentos/plantillas que contiene; luego la elimina.
   */
  async remove(user: RequestUser, id: string) {
    const folder = await this.getOrThrow(user, id);
    const parentId = folder.parentId;
    await tenantTransaction(this.prisma, async (tx) => {
      await tx.folder.updateMany({
        where: { tenantId: user.tenantId, parentId: id },
        data: { parentId },
      });
      if (folder.kind === FolderKind.DOCUMENT) {
        await tx.document.updateMany({
          where: { tenantId: user.tenantId, folderId: id },
          data: { folderId: parentId },
        });
      } else {
        await tx.documentTemplate.updateMany({
          where: { tenantId: user.tenantId, folderId: id },
          data: { folderId: parentId },
        });
      }
      await tx.folder.deleteMany({ where: { id, tenantId: user.tenantId } });
    });
    await this.audit.log(user, 'folder.deleted', 'Folder', id, { kind: folder.kind });
    return { success: true as const };
  }
}
