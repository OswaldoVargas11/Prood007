import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistItemStatus } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { PRESENTATION_SEED_CATALOG } from './seed-catalog';
import { buildChecklistPdf } from './checklist-pdf';
import {
  CreatePresentationTypeDto,
  RequirementInputDto,
  UpdatePresentationTypeDto,
} from './dto/presentation-type.dto';
import { UpdateChecklistItemDto } from './dto/checklist.dto';
import type { RequestUser } from '../auth/auth.types';

/**
 * Catálogo de tipos de presentación (editable por despacho) + checklists instanciadas por expediente.
 * Tenant-scoped (filtro `tenantId` + RLS). El contenido sembrado es de ejemplo y debe revisarlo el despacho.
 */
@Injectable()
export class PresentationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Catálogo ────────────────────────────────────────────────────────────────

  async listTypes(user: RequestUser) {
    return this.prisma.presentationType.findMany({
      where: { tenantId: user.tenantId },
      include: {
        requirements: { orderBy: { order: 'asc' } },
        _count: { select: { checklists: true } },
      },
      orderBy: [{ sector: 'asc' }, { name: 'asc' }],
    });
  }

  async getType(user: RequestUser, id: string) {
    const type = await this.prisma.presentationType.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { requirements: { orderBy: { order: 'asc' } } },
    });
    if (!type) throw new NotFoundException(apiError('presentations.notFound'));
    return type;
  }

  private requirementRows(tenantId: string, reqs: RequirementInputDto[] | undefined) {
    return (reqs ?? []).map((r, i) => ({
      tenantId,
      name: r.name.trim(),
      description: r.description?.trim() || null,
      required: r.required ?? true,
      order: r.order ?? i,
    }));
  }

  async createType(user: RequestUser, dto: CreatePresentationTypeDto) {
    const created = await this.prisma.presentationType.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        sector: dto.sector.trim(),
        jurisdiction: dto.jurisdiction ?? null,
        description: dto.description?.trim() || null,
        requirements: { create: this.requirementRows(user.tenantId, dto.requirements) },
      },
      include: { requirements: { orderBy: { order: 'asc' } } },
    });
    await this.audit.log(user, 'presentation_type.created', 'PresentationType', created.id, {
      name: created.name,
    });
    return created;
  }

  async updateType(user: RequestUser, id: string, dto: UpdatePresentationTypeDto) {
    await this.getType(user, id);
    const result = await tenantTransaction(this.prisma, async (tx) => {
      await tx.presentationType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sector !== undefined ? { sector: dto.sector.trim() } : {}),
          ...(dto.jurisdiction !== undefined ? { jurisdiction: dto.jurisdiction } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
        },
      });
      // Si llegan requisitos, se reemplaza el conjunto completo.
      if (dto.requirements !== undefined) {
        await tx.presentationRequirement.deleteMany({
          where: { tenantId: user.tenantId, presentationTypeId: id },
        });
        await tx.presentationRequirement.createMany({
          data: this.requirementRows(user.tenantId, dto.requirements).map((r) => ({
            ...r,
            presentationTypeId: id,
          })),
        });
      }
      return tx.presentationType.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { requirements: { orderBy: { order: 'asc' } } },
      });
    });
    await this.audit.log(user, 'presentation_type.updated', 'PresentationType', id);
    return result;
  }

  async removeType(user: RequestUser, id: string) {
    await this.getType(user, id);
    await this.prisma.presentationType.deleteMany({ where: { id, tenantId: user.tenantId } });
    await this.audit.log(user, 'presentation_type.deleted', 'PresentationType', id);
    return { success: true as const };
  }

  /**
   * Siembra el catálogo de ejemplo en el tenant. Idempotente: omite los tipos cuyo (nombre, sector,
   * jurisdicción) ya exista. Solo importa los de la jurisdicción del despacho + los comunes (null).
   */
  async seedDefaults(user: RequestUser) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId },
      select: { jurisdiction: true },
    });
    const existing = await this.prisma.presentationType.findMany({
      where: { tenantId: user.tenantId },
      select: { name: true, sector: true, jurisdiction: true },
    });
    const seen = new Set(existing.map((e) => `${e.name}|${e.sector}|${e.jurisdiction ?? ''}`));
    let created = 0;
    for (const entry of PRESENTATION_SEED_CATALOG) {
      if (entry.jurisdiction !== null && entry.jurisdiction !== tenant?.jurisdiction) continue;
      const key = `${entry.name}|${entry.sector}|${entry.jurisdiction ?? ''}`;
      if (seen.has(key)) continue;
      await this.prisma.presentationType.create({
        data: {
          tenantId: user.tenantId,
          name: entry.name,
          sector: entry.sector,
          jurisdiction: entry.jurisdiction,
          description: entry.description ?? null,
          requirements: {
            create: entry.requirements.map((r, i) => ({
              tenantId: user.tenantId,
              name: r.name,
              description: r.description ?? null,
              required: r.required ?? true,
              order: i,
            })),
          },
        },
      });
      created += 1;
    }
    await this.audit.log(user, 'presentation_type.seeded', 'PresentationType', user.tenantId, {
      created,
    });
    return { created };
  }

  // ── Instancia por expediente ──────────────────────────────────────────────

  private async assertMatterInTenant(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
  }

  async applyToMatter(user: RequestUser, matterId: string, presentationTypeId: string) {
    await this.assertMatterInTenant(user, matterId);
    const type = await this.getType(user, presentationTypeId);
    const checklist = await this.prisma.matterChecklist.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        presentationTypeId: type.id,
        title: type.name,
        items: {
          create: type.requirements.map((r) => ({
            tenantId: user.tenantId,
            requirementId: r.id,
            name: r.name,
            description: r.description,
            required: r.required,
            order: r.order,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    await this.audit.log(user, 'checklist.applied', 'MatterChecklist', checklist.id, {
      matterId,
      presentationTypeId: type.id,
    });
    return checklist;
  }

  /** Checklists del expediente con sus ítems y el progreso (aportados / requeridos). */
  async listForMatter(user: RequestUser, matterId: string) {
    await this.assertMatterInTenant(user, matterId);
    const checklists = await this.prisma.matterChecklist.findMany({
      where: { tenantId: user.tenantId, matterId },
      include: { items: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return checklists.map((c) => {
      const required = c.items.filter((i) => i.required && i.status !== ChecklistItemStatus.NA);
      const done = required.filter((i) => i.status === ChecklistItemStatus.UPLOADED);
      return {
        ...c,
        progress: {
          total: required.length,
          done: done.length,
          percent: required.length === 0 ? 100 : Math.round((done.length / required.length) * 100),
        },
      };
    });
  }

  async removeChecklist(user: RequestUser, matterId: string, checklistId: string) {
    const checklist = await this.prisma.matterChecklist.findFirst({
      where: { id: checklistId, tenantId: user.tenantId, matterId },
      select: { id: true },
    });
    if (!checklist) throw new NotFoundException(apiError('checklists.notFound'));
    await this.prisma.matterChecklist.deleteMany({
      where: { id: checklistId, tenantId: user.tenantId },
    });
    await this.audit.log(user, 'checklist.removed', 'MatterChecklist', checklistId, { matterId });
    return { success: true as const };
  }

  /** Genera el PDF del estado de una checklist (qué se ha aportado y qué falta) para enviar al cliente. */
  async checklistPdf(user: RequestUser, checklistId: string) {
    const checklist = await this.prisma.matterChecklist.findFirst({
      where: { id: checklistId, tenantId: user.tenantId },
      include: {
        items: { orderBy: { order: 'asc' } },
        matter: {
          select: { reference: true, title: true, client: { select: { name: true } } },
        },
      },
    });
    if (!checklist) throw new NotFoundException(apiError('checklists.notFound'));
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId },
      select: { name: true, taxId: true },
    });
    const required = checklist.items.filter((i) => i.required && i.status !== 'NA');
    const done = required.filter((i) => i.status === 'UPLOADED');
    const buffer = await buildChecklistPdf({
      firmName: tenant?.name ?? 'Despacho',
      firmTaxId: tenant?.taxId ?? null,
      matterReference: checklist.matter.reference,
      matterTitle: checklist.matter.title,
      clientName: checklist.matter.client?.name ?? null,
      title: checklist.title,
      items: checklist.items.map((i) => ({
        name: i.name,
        description: i.description,
        required: i.required,
        status: i.status,
      })),
      progress: {
        done: done.length,
        total: required.length,
        percent: required.length === 0 ? 100 : Math.round((done.length / required.length) * 100),
      },
      generatedAt: new Date(),
    });
    await this.audit.log(user, 'checklist.exported_pdf', 'MatterChecklist', checklistId);
    return { filename: `checklist-${checklist.matter.reference}.pdf`, buffer };
  }

  async updateItem(user: RequestUser, itemId: string, dto: UpdateChecklistItemDto) {
    const item = await this.prisma.matterChecklistItem.findFirst({
      where: { id: itemId, tenantId: user.tenantId },
      include: { checklist: { select: { matterId: true } } },
    });
    if (!item) throw new NotFoundException(apiError('checklists.itemNotFound'));

    // documentId !== undefined: enlazar (validar pertenencia al expediente) o desvincular (null).
    if (dto.documentId !== undefined && dto.documentId !== null) {
      const doc = await this.prisma.document.findFirst({
        where: { id: dto.documentId, tenantId: user.tenantId, matterId: item.checklist.matterId },
        select: { id: true },
      });
      if (!doc) throw new BadRequestException(apiError('checklists.documentMismatch'));
    }

    // Al enlazar un documento sin indicar estado, se marca como aportado.
    const status =
      dto.status ??
      (dto.documentId !== undefined && dto.documentId !== null
        ? ChecklistItemStatus.UPLOADED
        : undefined);

    await this.prisma.matterChecklistItem.updateMany({
      where: { id: itemId, tenantId: user.tenantId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(dto.documentId !== undefined ? { documentId: dto.documentId } : {}),
      },
    });
    return this.prisma.matterChecklistItem.findFirst({
      where: { id: itemId, tenantId: user.tenantId },
    });
  }
}
