import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatterStatus, Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CreateMatterDto } from './dto/create-matter.dto';
import { UpdateMatterDto } from './dto/update-matter.dto';
import { canTransition } from './matter-status';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/** Gestión de expedientes, acotada por tenant, con máquina de estados y asignación de abogado. */
@Injectable()
export class MattersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Comprueba que el cliente pertenece al tenant. */
  private async assertClientInTenant(user: RequestUser, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!client) throw new BadRequestException(apiError('matters.clientNotInFirm'));
  }

  /** Comprueba que el abogado pertenece al tenant y tiene rol LAWYER o FIRM_ADMIN. */
  private async assertLawyerInTenant(user: RequestUser, lawyerId: string): Promise<void> {
    const lawyer = await this.prisma.user.findFirst({
      where: {
        id: lawyerId,
        tenantId: user.tenantId,
        roles: { some: { role: { code: { in: [Role.LAWYER, Role.FIRM_ADMIN] } } } },
      },
      select: { id: true },
    });
    if (!lawyer) throw new BadRequestException(apiError('matters.invalidLawyer'));
  }

  private async generateReference(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.matter.count({ where: { tenantId } });
    return `EXP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  /** Solo el administrador del despacho asigna el letrado responsable. */
  private assertCanAssignLawyer(user: RequestUser): void {
    if (!user.roles.includes(Role.FIRM_ADMIN)) {
      throw new ForbiddenException(apiError('matters.assignLawyerAdminOnly'));
    }
  }

  /** Letrados del despacho a los que se puede asignar un expediente (LAWYER o FIRM_ADMIN activos). */
  async listAssignees(user: RequestUser) {
    const lawyers = await this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: [Role.LAWYER, Role.FIRM_ADMIN] } } } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return lawyers;
  }

  async create(user: RequestUser, dto: CreateMatterDto) {
    await this.assertClientInTenant(user, dto.clientId);
    if (dto.lawyerId) {
      this.assertCanAssignLawyer(user);
      await this.assertLawyerInTenant(user, dto.lawyerId);
    }

    const reference = dto.reference?.trim() || (await this.generateReference(user.tenantId));

    // Unicidad de referencia por tenant.
    const existing = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference },
      select: { id: true },
    });
    if (existing) throw new BadRequestException(apiError('matters.referenceExists'));

    const matter = await this.prisma.matter.create({
      data: {
        tenantId: user.tenantId,
        reference,
        title: dto.title,
        type: dto.type,
        clientId: dto.clientId,
        lawyerId: dto.lawyerId,
        status: MatterStatus.OPEN,
        opposingParty: dto.opposingParty?.trim() || null,
        opposingPartyTaxId: dto.opposingPartyTaxId?.trim() || null,
        opposingCounsel: dto.opposingCounsel?.trim() || null,
        court: dto.court?.trim() || null,
        caseNumber: dto.caseNumber?.trim() || null,
        proceduralPhase: dto.proceduralPhase?.trim() || null,
      },
    });
    await this.audit.log(user, 'matter.created', 'Matter', matter.id, { reference });
    return matter;
  }

  async findAll(
    user: RequestUser,
    page = 1,
    pageSize = 20,
    status?: MatterStatus,
    clientId?: string,
  ) {
    const where = {
      tenantId: user.tenantId,
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
    };
    const skip = (page - 1) * pageSize;
    const { items, total } = await tenantTransaction(this.prisma, async (tx) => {
      const items = await tx.matter.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        include: {
          client: { select: { id: true, name: true } },
          lawyer: { select: { id: true, fullName: true } },
        },
        skip,
        take: pageSize,
      });
      const total = await tx.matter.count({ where });
      return { items, total };
    });
    return { items, total, page, pageSize };
  }

  async findOne(user: RequestUser, id: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        client: { select: { id: true, name: true, taxId: true } },
        lawyer: { select: { id: true, fullName: true } },
      },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notFound'));
    // Consumido del presupuesto = valor del trabajo registrado (honorarios incurridos) del expediente.
    const entries = await this.prisma.timeEntry.findMany({
      where: { tenantId: user.tenantId, matterId: id },
      select: { minutes: true, hourlyRate: true },
    });
    const budgetConsumed =
      Math.round(entries.reduce((s, e) => s + (e.minutes / 60) * Number(e.hourlyRate), 0) * 100) /
      100;
    return { ...matter, budgetConsumed };
  }

  async update(user: RequestUser, id: string, dto: UpdateMatterDto) {
    await this.findOne(user, id);
    // Para campos de texto opcionales: undefined → no tocar; "" o solo espacios → limpiar (null).
    const text = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    await this.prisma.matter.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        title: dto.title,
        type: dto.type,
        // "" quita el presupuesto; undefined lo deja como está.
        budgetAmount:
          dto.budgetAmount === undefined
            ? undefined
            : dto.budgetAmount === ''
              ? null
              : dto.budgetAmount,
        opposingParty: text(dto.opposingParty),
        opposingPartyTaxId: text(dto.opposingPartyTaxId),
        opposingCounsel: text(dto.opposingCounsel),
        court: text(dto.court),
        caseNumber: text(dto.caseNumber),
        proceduralPhase: text(dto.proceduralPhase),
      },
    });
    await this.audit.log(user, 'matter.updated', 'Matter', id);
    return this.findOne(user, id);
  }

  /** Asigna (o desasigna con `null`) el letrado responsable. Solo administrador del despacho. */
  async assignLawyer(user: RequestUser, id: string, lawyerId: string | null) {
    this.assertCanAssignLawyer(user);
    await this.findOne(user, id);
    if (lawyerId) await this.assertLawyerInTenant(user, lawyerId);
    await this.prisma.matter.updateMany({
      where: { id, tenantId: user.tenantId },
      data: { lawyerId },
    });
    await this.audit.log(user, 'matter.lawyer_assigned', 'Matter', id, { lawyerId });
    return this.findOne(user, id);
  }

  /** Cambia el estado validando la transición contra la máquina de estados. */
  async changeStatus(user: RequestUser, id: string, next: MatterStatus) {
    const matter = await this.findOne(user, id);
    if (matter.status === next) return matter;
    if (!canTransition(matter.status as MatterStatus, next)) {
      throw new BadRequestException(
        apiError('matters.invalidTransition', {
          message: `Transición de estado no permitida: ${matter.status} → ${next}.`,
          params: { from: matter.status, to: next },
        }),
      );
    }
    await this.prisma.matter.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        status: next,
        closedAt: next === MatterStatus.CLOSED ? new Date() : matter.closedAt,
      },
    });
    await this.audit.log(user, 'matter.status_changed', 'Matter', id, {
      from: matter.status,
      to: next,
    });
    return this.findOne(user, id);
  }
}
