import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DealMilestoneKind,
  DealMilestoneStatus,
  DealPartyRole,
  DealPartySide,
  DisclosureScheduleStatus,
  FundsFlowKind,
  FundsFlowStatus,
  RegistryFilingStatus,
  RegistryKind,
} from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import {
  CreateDisclosureDto,
  CreateEscrowHoldingDto,
  CreateEscrowReleaseDto,
  CreateFilingDto,
  CreateFundsFlowLineDto,
  CreateMilestoneDto,
  CreatePartyDto,
  UpdateDisclosureDto,
  UpdateEscrowHoldingDto,
  UpdateFilingDto,
  UpdateFundsFlowLineDto,
  UpdateMilestoneDto,
  UpdatePartyDto,
} from './dto/deal.dto';
import { canRelease, computeEscrow, reconcileFundsFlow, toCents } from './funds-flow.logic';
import { buildFundsFlowStatement, type FundsFlowStatementData } from './funds-flow-statement';

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

const FUNDS_FLOW_SELECT = {
  id: true,
  kind: true,
  payerPartyId: true,
  payeePartyId: true,
  amount: true,
  currency: true,
  account: true,
  condition: true,
  status: true,
  settledAt: true,
  sortOrder: true,
} as const;

const ESCROW_RELEASE_SELECT = {
  id: true,
  amount: true,
  releasedAt: true,
  reason: true,
} as const;

const ESCROW_SELECT = {
  id: true,
  label: true,
  amount: true,
  currency: true,
  agent: true,
  depositedAt: true,
  releaseTrigger: true,
  status: true,
  notes: true,
  sortOrder: true,
  releases: { orderBy: { releasedAt: 'asc' }, select: ESCROW_RELEASE_SELECT },
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

  // ── Funds flow / escrow ──────────────────────────────────────────────────────

  /**
   * Valida que un payerPartyId/payeePartyId provisto pertenezca a una PARTE de esta operación (mismo
   * tenant + mismo expediente): igual que assertDocInTenant, evita vincular una parte de otro tenant o
   * de otro expediente. Solo verifica los ids realmente provistos.
   */
  private async assertPartyInMatter(
    user: RequestUser,
    matterId: string,
    partyId: string | null | undefined,
  ): Promise<void> {
    if (!partyId) return;
    const party = await this.prisma.dealParty.findFirst({
      where: { id: partyId, tenantId: user.tenantId, matterId },
      select: { id: true },
    });
    if (!party) throw new NotFoundException(apiError('deal.partyNotInMatter'));
  }

  /** Vista del funds-flow + escrow de un expediente, con el cuadre y el estado de cada depósito. */
  async fundsFlowOverview(user: RequestUser, matterId: string) {
    await this.assertMatterInTenant(user, matterId);
    const where = { matterId, tenantId: user.tenantId };
    const [lines, holdings] = await Promise.all([
      this.prisma.dealFundsFlowLine.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: FUNDS_FLOW_SELECT,
      }),
      this.prisma.escrowHolding.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: ESCROW_SELECT,
      }),
    ]);

    const reconciliation = reconcileFundsFlow(
      lines.map((l) => ({
        payerPartyId: l.payerPartyId,
        payeePartyId: l.payeePartyId,
        amount: l.amount.toString(),
        currency: l.currency,
      })),
    );

    return {
      lines: lines.map((l) => ({ ...l, amount: l.amount.toString() })),
      escrowHoldings: holdings.map((h) => {
        const calc = computeEscrow(
          h.amount.toString(),
          h.releases.map((r) => ({ amount: r.amount.toString() })),
        );
        return {
          ...h,
          amount: h.amount.toString(),
          released: calc.released.toFixed(2),
          remaining: calc.remaining.toFixed(2),
          releases: h.releases.map((r) => ({ ...r, amount: r.amount.toString() })),
        };
      }),
      reconciliation,
    };
  }

  async addFundsFlowLine(user: RequestUser, matterId: string, dto: CreateFundsFlowLineDto) {
    await this.assertMatterInTenant(user, matterId);
    await this.assertPartyInMatter(user, matterId, nullable(dto.payerPartyId));
    await this.assertPartyInMatter(user, matterId, nullable(dto.payeePartyId));
    const last = await this.prisma.dealFundsFlowLine.findFirst({
      where: { matterId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const status = (dto.status as FundsFlowStatus) ?? 'PLANNED';
    await this.prisma.dealFundsFlowLine.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        kind: (dto.kind as FundsFlowKind) ?? 'PAYMENT',
        payerPartyId: nullable(dto.payerPartyId) ?? null,
        payeePartyId: nullable(dto.payeePartyId) ?? null,
        amount: dto.amount,
        currency: dto.currency ?? 'EUR',
        account: nullable(dto.account) ?? null,
        condition: nullable(dto.condition) ?? null,
        status,
        settledAt: status === 'SETTLED' ? new Date() : null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.fundsFlowOverview(user, matterId);
  }

  async updateFundsFlowLine(user: RequestUser, id: string, dto: UpdateFundsFlowLineDto) {
    const row = await this.prisma.dealFundsFlowLine.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true, status: true, settledAt: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.assertPartyInMatter(user, row.matterId, nullable(dto.payerPartyId));
    await this.assertPartyInMatter(user, row.matterId, nullable(dto.payeePartyId));

    const settling = dto.status === 'SETTLED' && row.settledAt === null;
    const unsettling = dto.status === 'PLANNED';
    await this.prisma.dealFundsFlowLine.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind as FundsFlowKind } : {}),
        ...(dto.payerPartyId !== undefined ? { payerPartyId: nullable(dto.payerPartyId) } : {}),
        ...(dto.payeePartyId !== undefined ? { payeePartyId: nullable(dto.payeePartyId) } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.account !== undefined ? { account: nullable(dto.account) } : {}),
        ...(dto.condition !== undefined ? { condition: nullable(dto.condition) } : {}),
        ...(dto.status !== undefined ? { status: dto.status as FundsFlowStatus } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(settling ? { settledAt: new Date() } : {}),
        ...(unsettling ? { settledAt: null } : {}),
      },
    });
    return this.fundsFlowOverview(user, row.matterId);
  }

  async removeFundsFlowLine(user: RequestUser, id: string) {
    const row = await this.prisma.dealFundsFlowLine.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.dealFundsFlowLine.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.fundsFlowOverview(user, row.matterId);
  }

  async addEscrowHolding(user: RequestUser, matterId: string, dto: CreateEscrowHoldingDto) {
    await this.assertMatterInTenant(user, matterId);
    const last = await this.prisma.escrowHolding.findFirst({
      where: { matterId, tenantId: user.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await this.prisma.escrowHolding.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        label: dto.label.trim(),
        amount: dto.amount,
        currency: dto.currency ?? 'EUR',
        agent: nullable(dto.agent) ?? null,
        depositedAt: dto.depositedAt ? new Date(dto.depositedAt) : null,
        releaseTrigger: nullable(dto.releaseTrigger) ?? null,
        notes: nullable(dto.notes) ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return this.fundsFlowOverview(user, matterId);
  }

  async updateEscrowHolding(user: RequestUser, id: string, dto: UpdateEscrowHoldingDto) {
    const row = await this.prisma.escrowHolding.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.escrowHolding.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.agent !== undefined ? { agent: nullable(dto.agent) } : {}),
        ...(dto.depositedAt !== undefined
          ? { depositedAt: dto.depositedAt ? new Date(dto.depositedAt) : null }
          : {}),
        ...(dto.releaseTrigger !== undefined
          ? { releaseTrigger: nullable(dto.releaseTrigger) }
          : {}),
        ...(dto.notes !== undefined ? { notes: nullable(dto.notes) } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    // El importe pudo cambiar: recomputa el estado (HELD/PARTIALLY_RELEASED/RELEASED).
    await this.recomputeEscrowStatus(user, id);
    return this.fundsFlowOverview(user, row.matterId);
  }

  async removeEscrowHolding(user: RequestUser, id: string) {
    const row = await this.prisma.escrowHolding.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { matterId: true },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.escrowHolding.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.fundsFlowOverview(user, row.matterId);
  }

  /** Registra una liberación parcial/total de un depósito y recomputa su estado (HELD→…→RELEASED). */
  async addEscrowRelease(user: RequestUser, holdingId: string, dto: CreateEscrowReleaseDto) {
    const holding = await this.prisma.escrowHolding.findFirst({
      where: { id: holdingId, tenantId: user.tenantId },
      select: {
        matterId: true,
        amount: true,
        releases: { select: { amount: true } },
      },
    });
    if (!holding) throw new NotFoundException(apiError('deal.notFound'));

    const calc = computeEscrow(
      holding.amount.toString(),
      holding.releases.map((r) => ({ amount: r.amount.toString() })),
    );
    if (!canRelease(calc.remainingCents, toCents(dto.amount))) {
      throw new BadRequestException(apiError('deal.escrowReleaseExceeds'));
    }

    await this.prisma.escrowRelease.create({
      data: {
        tenantId: user.tenantId,
        holdingId,
        amount: dto.amount,
        releasedAt: dto.releasedAt ? new Date(dto.releasedAt) : new Date(),
        reason: nullable(dto.reason) ?? null,
      },
    });
    await this.recomputeEscrowStatus(user, holdingId);
    return this.fundsFlowOverview(user, holding.matterId);
  }

  async removeEscrowRelease(user: RequestUser, id: string) {
    const row = await this.prisma.escrowRelease.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { holdingId: true, holding: { select: { matterId: true } } },
    });
    if (!row) throw new NotFoundException(apiError('deal.notFound'));
    await this.prisma.escrowRelease.deleteMany({ where: { id, tenantId: user.tenantId } });
    await this.recomputeEscrowStatus(user, row.holdingId);
    return this.fundsFlowOverview(user, row.holding.matterId);
  }

  /** Recalcula y persiste el estado de un depósito a partir de sus liberaciones (fuente de verdad: los releases). */
  private async recomputeEscrowStatus(user: RequestUser, holdingId: string): Promise<void> {
    const holding = await this.prisma.escrowHolding.findFirst({
      where: { id: holdingId, tenantId: user.tenantId },
      select: { amount: true, status: true, releases: { select: { amount: true } } },
    });
    if (!holding) return;
    const calc = computeEscrow(
      holding.amount.toString(),
      holding.releases.map((r) => ({ amount: r.amount.toString() })),
    );
    if (calc.status !== holding.status) {
      await this.prisma.escrowHolding.updateMany({
        where: { id: holdingId, tenantId: user.tenantId },
        data: { status: calc.status },
      });
    }
  }

  /** Genera el closing statement (funds-flow + escrow) como PDF con el lenguaje visual de marca. */
  async buildFundsFlowStatement(
    user: RequestUser,
    matterId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    await this.assertMatterInTenant(user, matterId);
    const [matter, tenant, overview] = await Promise.all([
      this.prisma.matter.findFirstOrThrow({
        where: { id: matterId, tenantId: user.tenantId },
        select: { reference: true, title: true },
      }),
      this.prisma.tenant.findFirstOrThrow({
        where: { id: user.tenantId },
        select: { name: true, taxId: true },
      }),
      this.fundsFlowOverview(user, matterId),
    ]);

    const parties = await this.prisma.dealParty.findMany({
      where: { matterId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    const partyName = new Map(parties.map((p) => [p.id, p.name]));

    const data: FundsFlowStatementData = {
      firmName: tenant.name,
      firmTaxId: tenant.taxId,
      matterReference: matter.reference,
      matterTitle: matter.title,
      generatedAt: new Date(),
      lines: overview.lines.map((l) => ({
        kind: l.kind,
        payerName: l.payerPartyId ? (partyName.get(l.payerPartyId) ?? null) : null,
        payeeName: l.payeePartyId ? (partyName.get(l.payeePartyId) ?? null) : null,
        amount: l.amount,
        currency: l.currency,
        account: l.account,
        condition: l.condition,
        status: l.status,
      })),
      reconciliation: overview.reconciliation,
      escrowHoldings: overview.escrowHoldings.map((h) => ({
        label: h.label,
        amount: h.amount,
        currency: h.currency,
        agent: h.agent,
        status: h.status,
        released: h.released,
        remaining: h.remaining,
        releaseTrigger: h.releaseTrigger,
      })),
    };

    const buffer = await buildFundsFlowStatement(data);
    const filename = `funds-flow-${slugRef(matter.reference)}.pdf`;
    return { filename, buffer };
  }
}

/** Slug ligero para nombres de fichero (igual criterio que el closing binder). */
function slugRef(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'operacion'
  );
}
