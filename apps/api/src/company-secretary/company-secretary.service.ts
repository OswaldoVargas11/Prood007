import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import {
  CreateMinuteDto,
  CreateObligationDto,
  CreateShareholderDto,
  CreateTransferDto,
  UpdateObligationDto,
  UpdateShareholderDto,
} from './dto/company-secretary.dto';

/**
 * Secretaría de sociedades: libro de actas, libro de socios (+ transmisiones) y obligaciones recurrentes
 * al Registro, por sociedad (Client). Acotado al tenant por RLS; cada operación verifica el cliente.
 */
@Injectable()
export class CompanySecretaryService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertClientInTenant(user: RequestUser, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException(apiError('clients.notFound'));
  }

  /** Vista completa de la secretaría de una sociedad. */
  async overview(user: RequestUser, clientId: string) {
    await this.assertClientInTenant(user, clientId);
    const where = { clientId, tenantId: user.tenantId };
    const [minutes, shareholders, transfers, obligations] = await Promise.all([
      this.prisma.corporateMinute.findMany({
        where,
        orderBy: { meetingDate: 'desc' },
        select: { id: true, kind: true, title: true, meetingDate: true, body: true },
      }),
      this.prisma.shareholder.findMany({
        where,
        orderBy: { units: 'desc' },
        select: { id: true, name: true, taxId: true, units: true },
      }),
      this.prisma.shareTransfer.findMany({
        where,
        orderBy: { date: 'desc' },
        select: { id: true, fromName: true, toName: true, units: true, date: true, note: true },
      }),
      this.prisma.registryObligation.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        select: {
          id: true,
          title: true,
          dueDate: true,
          recurrence: true,
          status: true,
          filedAt: true,
        },
      }),
    ]);
    const totalUnits = shareholders.reduce((sum, s) => sum + s.units, 0);
    return { minutes, shareholders, transfers, obligations, totalUnits };
  }

  // ── Actas ──────────────────────────────────────────────────────────────────

  async addMinute(user: RequestUser, clientId: string, dto: CreateMinuteDto) {
    await this.assertClientInTenant(user, clientId);
    await this.prisma.corporateMinute.create({
      data: {
        tenantId: user.tenantId,
        clientId,
        kind: dto.kind ?? 'GENERAL_MEETING',
        title: dto.title.trim(),
        meetingDate: new Date(dto.meetingDate),
        body: dto.body,
      },
    });
    return this.overview(user, clientId);
  }

  async removeMinute(user: RequestUser, id: string) {
    const row = await this.prisma.corporateMinute.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { clientId: true },
    });
    if (!row) throw new NotFoundException(apiError('companySecretary.notFound'));
    await this.prisma.corporateMinute.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.clientId);
  }

  // ── Socios + transmisiones ───────────────────────────────────────────────────

  async addShareholder(user: RequestUser, clientId: string, dto: CreateShareholderDto) {
    await this.assertClientInTenant(user, clientId);
    await this.prisma.shareholder.create({
      data: {
        tenantId: user.tenantId,
        clientId,
        name: dto.name.trim(),
        taxId: dto.taxId?.trim() || null,
        units: dto.units,
      },
    });
    return this.overview(user, clientId);
  }

  async updateShareholder(user: RequestUser, id: string, dto: UpdateShareholderDto) {
    const row = await this.prisma.shareholder.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { clientId: true },
    });
    if (!row) throw new NotFoundException(apiError('companySecretary.notFound'));
    await this.prisma.shareholder.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.taxId !== undefined ? { taxId: dto.taxId.trim() || null } : {}),
        ...(dto.units !== undefined ? { units: dto.units } : {}),
      },
    });
    return this.overview(user, row.clientId);
  }

  async removeShareholder(user: RequestUser, id: string) {
    const row = await this.prisma.shareholder.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { clientId: true },
    });
    if (!row) throw new NotFoundException(apiError('companySecretary.notFound'));
    await this.prisma.shareholder.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.clientId);
  }

  async addTransfer(user: RequestUser, clientId: string, dto: CreateTransferDto) {
    await this.assertClientInTenant(user, clientId);
    await this.prisma.shareTransfer.create({
      data: {
        tenantId: user.tenantId,
        clientId,
        fromName: dto.fromName?.trim() || null,
        toName: dto.toName.trim(),
        units: dto.units,
        date: new Date(dto.date),
        note: dto.note?.trim() || null,
      },
    });
    return this.overview(user, clientId);
  }

  async removeTransfer(user: RequestUser, id: string) {
    const row = await this.prisma.shareTransfer.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { clientId: true },
    });
    if (!row) throw new NotFoundException(apiError('companySecretary.notFound'));
    await this.prisma.shareTransfer.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.clientId);
  }

  // ── Obligaciones registrales ─────────────────────────────────────────────────

  async addObligation(user: RequestUser, clientId: string, dto: CreateObligationDto) {
    await this.assertClientInTenant(user, clientId);
    await this.prisma.registryObligation.create({
      data: {
        tenantId: user.tenantId,
        clientId,
        title: dto.title.trim(),
        dueDate: new Date(dto.dueDate),
        recurrence: dto.recurrence ?? 'ANNUAL',
      },
    });
    return this.overview(user, clientId);
  }

  /**
   * Edita una obligación. Al marcarla FILED, si es ANUAL se programa automáticamente la del año
   * siguiente (PENDING) — así las obligaciones recurrentes al Registro nunca se pierden.
   */
  async updateObligation(user: RequestUser, id: string, dto: UpdateObligationDto) {
    const row = await this.prisma.registryObligation.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { clientId: true, title: true, dueDate: true, recurrence: true, status: true },
    });
    if (!row) throw new NotFoundException(apiError('companySecretary.notFound'));

    const markingFiled = dto.status === 'FILED' && row.status !== 'FILED';
    await this.prisma.registryObligation.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.recurrence !== undefined ? { recurrence: dto.recurrence } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(markingFiled ? { filedAt: new Date() } : {}),
      },
    });

    const recurrence = dto.recurrence ?? row.recurrence;
    if (markingFiled && recurrence === 'ANNUAL') {
      const next = new Date(row.dueDate);
      next.setFullYear(next.getFullYear() + 1);
      await this.prisma.registryObligation.create({
        data: {
          tenantId: user.tenantId,
          clientId: row.clientId,
          title: dto.title?.trim() ?? row.title,
          dueDate: next,
          recurrence: 'ANNUAL',
        },
      });
    }
    return this.overview(user, row.clientId);
  }

  async removeObligation(user: RequestUser, id: string) {
    const row = await this.prisma.registryObligation.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { clientId: true },
    });
    if (!row) throw new NotFoundException(apiError('companySecretary.notFound'));
    await this.prisma.registryObligation.deleteMany({ where: { id, tenantId: user.tenantId } });
    return this.overview(user, row.clientId);
  }
}
