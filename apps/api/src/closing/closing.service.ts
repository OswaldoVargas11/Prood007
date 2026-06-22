import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import { STORAGE_PROVIDER, type StorageProvider } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CLOSING_TEMPLATES, findClosingTemplate } from './closing-templates';
import { buildClosingBinderIndex, type BinderGroup, type BinderItem } from './closing-binder';

const ITEM_SELECT = {
  id: true,
  category: true,
  title: true,
  detail: true,
  status: true,
  responsibleParty: true,
  assigneeId: true,
  documentId: true,
  dueDate: true,
  sortOrder: true,
} as const;

// Orden de presentación por naturaleza (string-union; la salida de Prisma asigna a estos literales).
const CATEGORY_ORDER = ['CONDITION_PRECEDENT', 'DELIVERABLE', 'SIGNATURE_PAGE', 'OTHER'] as const;

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
};

function extForMime(mime: string): string {
  return MIME_EXT[mime] ?? 'bin';
}

function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'documento'
  );
}

/** Normaliza una cadena de un PATCH: '' → null (desvincular), undefined → no tocar. */
function nullable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Checklist de cierre transaccional (condiciones previas, entregables, hojas de firma) y generación del
 * closing binder. Acotado al tenant por RLS; cada operación verifica además la pertenencia del expediente.
 */
@Injectable()
export class ClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Plantillas integradas (estáticas) que el despacho puede instanciar. */
  templates() {
    return CLOSING_TEMPLATES.map((t) => ({
      key: t.key,
      title: t.title,
      description: t.description,
      itemCount: t.items.length,
    }));
  }

  private async assertMatterInTenant(user: RequestUser, matterId: string): Promise<void> {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notInFirm'));
  }

  private async getChecklistOrThrow(user: RequestUser, id: string) {
    const checklist = await this.prisma.closingChecklist.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, matterId: true, title: true, closingDate: true },
    });
    if (!checklist) throw new NotFoundException(apiError('closing.checklistNotFound'));
    return checklist;
  }

  /** Lista los checklists de un expediente con un resumen de progreso. */
  async listByMatter(user: RequestUser, matterId: string) {
    await this.assertMatterInTenant(user, matterId);
    const checklists = await this.prisma.closingChecklist.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        closingDate: true,
        createdAt: true,
        items: { select: { status: true } },
      },
    });
    return checklists.map((c) => {
      const total = c.items.length;
      const satisfied = c.items.filter(
        (i) => i.status === 'SATISFIED' || i.status === 'WAIVED',
      ).length;
      return {
        id: c.id,
        title: c.title,
        closingDate: c.closingDate,
        createdAt: c.createdAt,
        total,
        satisfied,
      };
    });
  }

  /** Checklist con sus partidas ordenadas por categoría y orden manual. */
  async getOne(user: RequestUser, id: string) {
    const checklist = await this.prisma.closingChecklist.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        matterId: true,
        title: true,
        closingDate: true,
        items: { select: ITEM_SELECT },
      },
    });
    if (!checklist) throw new NotFoundException(apiError('closing.checklistNotFound'));
    const items = [...checklist.items].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.sortOrder - b.sortOrder,
    );
    return { ...checklist, items };
  }

  async create(user: RequestUser, dto: CreateChecklistDto) {
    await this.assertMatterInTenant(user, dto.matterId);
    const template = dto.templateKey ? findClosingTemplate(dto.templateKey) : undefined;

    const checklist = await this.prisma.closingChecklist.create({
      data: {
        tenantId: user.tenantId,
        matterId: dto.matterId,
        title: dto.title.trim(),
      },
      select: { id: true },
    });

    if (template && template.items.length > 0) {
      await this.prisma.closingChecklistItem.createMany({
        data: template.items.map((item, idx) => ({
          tenantId: user.tenantId,
          checklistId: checklist.id,
          category: item.category,
          title: item.title,
          detail: item.detail ?? null,
          responsibleParty: item.responsibleParty ?? null,
          sortOrder: idx,
        })),
      });
    }

    await this.audit.log(user, 'closing.checklist_created', 'ClosingChecklist', checklist.id, {
      matterId: dto.matterId,
      templateKey: dto.templateKey ?? null,
    });
    return this.getOne(user, checklist.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateChecklistDto) {
    await this.getChecklistOrThrow(user, id);
    await this.prisma.closingChecklist.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.closingDate !== undefined ? { closingDate: new Date(dto.closingDate) } : {}),
      },
    });
    return this.getOne(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.closingChecklist.deleteMany({
      where: { id, tenantId: user.tenantId },
    });
    if (res.count === 0) throw new NotFoundException(apiError('closing.checklistNotFound'));
    await this.audit.log(user, 'closing.checklist_deleted', 'ClosingChecklist', id);
    return { success: true };
  }

  async addItem(user: RequestUser, checklistId: string, dto: CreateItemDto) {
    await this.getChecklistOrThrow(user, checklistId);
    const last = await this.prisma.closingChecklistItem.findFirst({
      where: { checklistId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await this.prisma.closingChecklistItem.create({
      data: {
        tenantId: user.tenantId,
        checklistId,
        category: dto.category,
        title: dto.title.trim(),
        detail: nullable(dto.detail) ?? null,
        responsibleParty: nullable(dto.responsibleParty) ?? null,
        assigneeId: nullable(dto.assigneeId) ?? null,
        documentId: nullable(dto.documentId) ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.getOne(user, checklistId);
  }

  async updateItem(user: RequestUser, itemId: string, dto: UpdateItemDto) {
    const item = await this.prisma.closingChecklistItem.findFirst({
      where: { id: itemId, tenantId: user.tenantId },
      select: { id: true, checklistId: true },
    });
    if (!item) throw new NotFoundException(apiError('closing.itemNotFound'));

    await this.prisma.closingChecklistItem.updateMany({
      where: { id: itemId, tenantId: user.tenantId },
      data: {
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.detail !== undefined ? { detail: nullable(dto.detail) } : {}),
        ...(dto.responsibleParty !== undefined
          ? { responsibleParty: nullable(dto.responsibleParty) }
          : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: nullable(dto.assigneeId) } : {}),
        ...(dto.documentId !== undefined ? { documentId: nullable(dto.documentId) } : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return this.getOne(user, item.checklistId);
  }

  async removeItem(user: RequestUser, itemId: string) {
    const item = await this.prisma.closingChecklistItem.findFirst({
      where: { id: itemId, tenantId: user.tenantId },
      select: { checklistId: true },
    });
    if (!item) throw new NotFoundException(apiError('closing.itemNotFound'));
    await this.prisma.closingChecklistItem.deleteMany({
      where: { id: itemId, tenantId: user.tenantId },
    });
    return this.getOne(user, item.checklistId);
  }

  /**
   * Genera el closing binder como ZIP: un índice PDF (portada + partidas por categoría) más el último
   * fichero de cada documento vinculado. Devuelve nombre + buffer listos para descargar.
   */
  async buildBinder(
    user: RequestUser,
    checklistId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const checklist = await this.prisma.closingChecklist.findFirst({
      where: { id: checklistId, tenantId: user.tenantId },
      select: {
        id: true,
        title: true,
        closingDate: true,
        items: { select: ITEM_SELECT },
        matter: { select: { reference: true, title: true } },
      },
    });
    if (!checklist) throw new NotFoundException(apiError('closing.checklistNotFound'));

    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: { id: user.tenantId },
      select: { name: true, taxId: true },
    });

    const items = [...checklist.items].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.sortOrder - b.sortOrder,
    );

    // Resolver nombres de los asignados (en bloque).
    const assigneeIds = [
      ...new Set(items.map((i) => i.assigneeId).filter((v): v is string => !!v)),
    ];
    const assignees = assigneeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: assigneeIds }, tenantId: user.tenantId },
          select: { id: true, fullName: true },
        })
      : [];
    const assigneeName = new Map(assignees.map((u) => [u.id, u.fullName]));

    // Resolver la última versión de cada documento vinculado.
    const documentIds = [
      ...new Set(items.map((i) => i.documentId).filter((v): v is string => !!v)),
    ];
    const docs = documentIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: documentIds }, tenantId: user.tenantId },
          select: {
            id: true,
            name: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { storageKey: true, mimeType: true },
            },
          },
        })
      : [];
    const docById = new Map(docs.map((d) => [d.id, d]));

    const zip = new JSZip();
    const groups: BinderGroup[] = [];
    let fileIndex = 1;

    for (const category of CATEGORY_ORDER) {
      const groupItems = items.filter((i) => i.category === category);
      if (groupItems.length === 0) continue;
      const binderItems: BinderItem[] = [];
      for (const item of groupItems) {
        const doc = item.documentId ? docById.get(item.documentId) : undefined;
        const version = doc?.versions[0];
        let bundledFileName: string | null = null;
        if (doc && version) {
          const ext = extForMime(version.mimeType);
          bundledFileName = `${String(fileIndex).padStart(2, '0')}-${slug(doc.name)}.${ext}`;
          try {
            const bytes = await this.storage.get(version.storageKey);
            zip.file(`documentos/${bundledFileName}`, bytes);
            fileIndex += 1;
          } catch {
            // Si el objeto falta en el almacenamiento, lo reflejamos como no incluido en el índice.
            bundledFileName = null;
          }
        }
        binderItems.push({
          title: item.title,
          detail: item.detail,
          status: item.status,
          responsibleParty: item.responsibleParty,
          assigneeName: item.assigneeId ? (assigneeName.get(item.assigneeId) ?? null) : null,
          dueDate: item.dueDate,
          documentName: doc?.name ?? null,
          bundledFileName,
        });
      }
      groups.push({ category, items: binderItems });
    }

    const indexPdf = await buildClosingBinderIndex({
      firmName: tenant.name,
      firmTaxId: tenant.taxId,
      matterReference: checklist.matter.reference,
      matterTitle: checklist.matter.title,
      checklistTitle: checklist.title,
      closingDate: checklist.closingDate,
      generatedAt: new Date(),
      groups,
    });
    zip.file('00-Indice.pdf', indexPdf);

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await this.audit.log(user, 'closing.binder_generated', 'ClosingChecklist', checklist.id, {
      items: items.length,
      bundledFiles: fileIndex - 1,
    });
    const filename = `closing-binder-${slug(checklist.matter.reference)}.zip`;
    return { filename, buffer };
  }
}
