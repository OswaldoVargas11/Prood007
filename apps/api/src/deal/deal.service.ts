import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DealMilestoneKind,
  DealMilestoneStatus,
  DealPartyRole,
  DealPartySide,
  DisclosureScheduleStatus,
  RegistryFilingStatus,
  RegistryKind,
} from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import {
  CreateDisclosureDto,
  CreateFilingDto,
  CreateMilestoneDto,
  CreatePartyDto,
  UpdateDisclosureDto,
  UpdateFilingDto,
  UpdateMilestoneDto,
  UpdatePartyDto,
} from './dto/deal.dto';

/** Normaliza una cadena de un PATCH: '' → null (desvincular), undefined → no tocar. */
function nullable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const PARTY_SELECT = {
  id: true,
  side: true,
  role: true,
  name: true,
  organization: true,
  email: true,
  phone: true,
  isDistribution: true,
  notes: true,
  sortOrder: true,
} as const;

const MILESTONE_SELECT = {
  id: true,
  kind: true,
  title: true,
  targetDate: true,
  status: true,
  completedAt: true,
  notes: true,
  sortOrder: true,
} as const;

const DISCLOSURE_SELECT = {
  id: true,
  number: true,
  repWarranty: true,
  title: true,
  body: true,
  documentId: true,
  status: true,
  sortOrder: true,
} as const;

const FILING_SELECT = {
  id: true,
  registry: true,
  title: true,
  referenceCode: true,
  status: true,
  submittedAt: true,
  registeredAt: true,
  documentId: true,
  notes: true,
  sortOrder: true,
} as const;

/**
 * Operación transaccional (deal): partes y distribución, hitos (firma/cierre/longstop), disclosure
 * schedules y presentaciones registrales, por expediente. Acotado al tenant por RLS; cada operación
 * verifica además la pertenencia del expediente.
 */
@Injectable()
export class DealService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMatterInTenant(user: RequestUser, matterId: string): Promise<void> {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notInFirm'));
  }

  /**
   * Valida que un documentId provisto pertenezca al despacho antes de vincularlo: el DTO trae un id
   * plano sin relación tipada, así que sin esta comprobación se podría vincular un documento de OTRO
   * tenant. Solo verifica el id realmente provisto.
   */
  private async assertDocInTenant(
    user: RequestUser,
    documentId: string | null | undefined,
  ): Promise<void> {
    if (!documentId) return;
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!document) throw new NotFoundException(apiError('documents.notFound'));
  }

  /** Vista completa de la operación de un expediente. */
  async overview(user: RequestUser, matterId: string) {
    await this.assertMatterInTenant(user, matterId);
    const where = { matterId, tenantId: user.tenantId };
    const [parties, milestones, disclosureSchedules, registryFilings] = await Promise.all([
      this.prisma.dealParty.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: PARTY_SELECT,
      }),
      this.prisma.dealMilestone.findMany({
        where,
        orderBy: { targetDate: 'asc' },
        select: MILESTONE_SELECT,
      }),
      this.prisma.disclosureSchedule.findMany({
        where,
        orderBy: [{ number: 'asc' }, { sortOrder: 'asc' }],
        select: DISCLOSURE_SELECT,
      }),
      this.prisma.registryFiling.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: FILING_SELECT,
      }),
    ]);
    return { parties, milestones, disclosureSchedules, registryFilings };
  }

  // ── Partes ───────────────────────────────────────────────────────────────────

  async addParty(user: RequestUser, matterId: string, dto: CreatePartyDto) {
    await this.assertMatterInTenant(user, matterId);
    const last = await this.prisma.dealParty.findFirst({
      where: { matterId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await this.prisma.dealParty.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        side: (dto.side as DealPartySide) ?? 'OTHER',
        role: (dto.role as DealPartyRole) ?? 'PRINCIPAL',
        name: dto.name.trim(),
        organization: nullable(dto.organization) ?? null,
        email: nullable(dto.email) ?? null,
        phone: nullable(dto.phone) ?? null,
        ...(dto.isDistribution !== undefined ? { isDistribution: dto.isDistribution } : {}),
        notes: nullable(dto.notes) ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.overview(user, matterId);
  }

  async updateParty(user: RequestUser, id: string, dto: UpdatePartyDto) {
    const row = await this.prisma.dealParty.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.dealParty.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.side !== undefined ? { side: dto.side as DealPartySide } : {}),
        ...(dto.role !== undefined ? { role: dto.role as DealPartyRole } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.organization !== undefined ? { organization: nullable(dto.organization) } : {}),
        ...(dto.email !== undefined ? { email: nullable(dto.email) } : {}),
        ...(dto.phone !== undefined ? { phone: nullable(dto.phone) } : {}),
        ...(dto.isDistribution !== undefined ? { isDistribution: dto.isDistribution } : {}),
        ...(dto.notes !== undefined ? { notes: nullable(dto.notes) } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return this.overview(user, row.matterId);
  }

  async removeParty(user: RequestUser, id: string) {
    const row = await this.prisma.dealParty.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.dealParty.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.matterId);
  }

  // ── Hitos ──────────────────────────────────────────────────────────────────

  async addMilestone(user: RequestUser, matterId: string, dto: CreateMilestoneDto) {
    await this.assertMatterInTenant(user, matterId);
    const last = await this.prisma.dealMilestone.findFirst({
      where: { matterId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await this.prisma.dealMilestone.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        kind: (dto.kind as DealMilestoneKind) ?? 'CUSTOM',
        title: dto.title.trim(),
        targetDate: new Date(dto.targetDate),
        notes: nullable(dto.notes) ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.overview(user, matterId);
  }

  async updateMilestone(user: RequestUser, id: string, dto: UpdateMilestoneDto) {
    const row = await this.prisma.dealMilestone.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true, status: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));

    const markingDone = dto.status === 'DONE' && row.status !== 'DONE';
    const clearingDone = dto.status !== undefined && dto.status !== 'DONE';
    await this.prisma.dealMilestone.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind as DealMilestoneKind } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.targetDate !== undefined ? { targetDate: new Date(dto.targetDate) } : {}),
        ...(dto.status !== undefined ? { status: dto.status as DealMilestoneStatus } : {}),
        ...(dto.notes !== undefined ? { notes: nullable(dto.notes) } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(markingDone ? { completedAt: new Date() } : {}),
        ...(clearingDone ? { completedAt: null } : {}),
      },
    });
    return this.overview(user, row.matterId);
  }

  async removeMilestone(user: RequestUser, id: string) {
    const row = await this.prisma.dealMilestone.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.dealMilestone.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.matterId);
  }

  // ── Disclosure schedules ─────────────────────────────────────────────────────

  async addDisclosure(user: RequestUser, matterId: string, dto: CreateDisclosureDto) {
    await this.assertMatterInTenant(user, matterId);
    await this.assertDocInTenant(user, nullable(dto.documentId));
    const last = await this.prisma.disclosureSchedule.findFirst({
      where: { matterId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await this.prisma.disclosureSchedule.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        number: dto.number.trim(),
        repWarranty: nullable(dto.repWarranty) ?? null,
        title: dto.title.trim(),
        body: nullable(dto.body) ?? null,
        documentId: nullable(dto.documentId) ?? null,
        status: (dto.status as DisclosureScheduleStatus) ?? 'DRAFT',
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.overview(user, matterId);
  }

  async updateDisclosure(user: RequestUser, id: string, dto: UpdateDisclosureDto) {
    const row = await this.prisma.disclosureSchedule.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.assertDocInTenant(user, nullable(dto.documentId));
    await this.prisma.disclosureSchedule.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.number !== undefined ? { number: dto.number.trim() } : {}),
        ...(dto.repWarranty !== undefined ? { repWarranty: nullable(dto.repWarranty) } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: nullable(dto.body) } : {}),
        ...(dto.documentId !== undefined ? { documentId: nullable(dto.documentId) } : {}),
        ...(dto.status !== undefined ? { status: dto.status as DisclosureScheduleStatus } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return this.overview(user, row.matterId);
  }

  async removeDisclosure(user: RequestUser, id: string) {
    const row = await this.prisma.disclosureSchedule.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.disclosureSchedule.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.matterId);
  }

  // ── Presentaciones registrales ────────────────────────────────────────────────

  async addFiling(user: RequestUser, matterId: string, dto: CreateFilingDto) {
    await this.assertMatterInTenant(user, matterId);
    await this.assertDocInTenant(user, nullable(dto.documentId));
    const last = await this.prisma.registryFiling.findFirst({
      where: { matterId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await this.prisma.registryFiling.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        registry: (dto.registry as RegistryKind) ?? 'OTHER',
        title: dto.title.trim(),
        referenceCode: nullable(dto.referenceCode) ?? null,
        documentId: nullable(dto.documentId) ?? null,
        notes: nullable(dto.notes) ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.overview(user, matterId);
  }

  async updateFiling(user: RequestUser, id: string, dto: UpdateFilingDto) {
    const row = await this.prisma.registryFiling.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true, submittedAt: true, registeredAt: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.assertDocInTenant(user, nullable(dto.documentId));

    const stampSubmitted = dto.status === 'SUBMITTED' && row.submittedAt === null;
    const stampRegistered = dto.status === 'REGISTERED' && row.registeredAt === null;
    await this.prisma.registryFiling.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.registry !== undefined ? { registry: dto.registry as RegistryKind } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.referenceCode !== undefined ? { referenceCode: nullable(dto.referenceCode) } : {}),
        ...(dto.status !== undefined ? { status: dto.status as RegistryFilingStatus } : {}),
        ...(dto.documentId !== undefined ? { documentId: nullable(dto.documentId) } : {}),
        ...(dto.notes !== undefined ? { notes: nullable(dto.notes) } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(stampSubmitted ? { submittedAt: new Date() } : {}),
        ...(stampRegistered ? { registeredAt: new Date() } : {}),
      },
    });
    return this.overview(user, row.matterId);
  }

  async removeFiling(user: RequestUser, id: string) {
    const row = await this.prisma.registryFiling.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.registryFiling.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.matterId);
  }
}
