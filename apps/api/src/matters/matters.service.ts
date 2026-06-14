import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatterStatus, Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CreateMatterDto } from './dto/create-matter.dto';
import { UpdateMatterDto } from './dto/update-matter.dto';
import { canTransition } from './matter-status';
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
    if (!client) throw new BadRequestException('El cliente no existe en este despacho.');
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
    if (!lawyer) throw new BadRequestException('El abogado no es válido para este despacho.');
  }

  private async generateReference(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.matter.count({ where: { tenantId } });
    return `EXP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(user: RequestUser, dto: CreateMatterDto) {
    await this.assertClientInTenant(user, dto.clientId);
    if (dto.lawyerId) await this.assertLawyerInTenant(user, dto.lawyerId);

    const reference = dto.reference?.trim() || (await this.generateReference(user.tenantId));

    // Unicidad de referencia por tenant.
    const existing = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('Ya existe un expediente con esa referencia.');

    const matter = await this.prisma.matter.create({
      data: {
        tenantId: user.tenantId,
        reference,
        title: dto.title,
        type: dto.type,
        clientId: dto.clientId,
        lawyerId: dto.lawyerId,
        status: MatterStatus.OPEN,
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
      include: { client: { select: { id: true, name: true, taxId: true } } },
    });
    if (!matter) throw new NotFoundException('Expediente no encontrado.');
    return matter;
  }

  async update(user: RequestUser, id: string, dto: UpdateMatterDto) {
    await this.findOne(user, id);
    if (dto.lawyerId) await this.assertLawyerInTenant(user, dto.lawyerId);
    await this.prisma.matter.updateMany({
      where: { id, tenantId: user.tenantId },
      data: { title: dto.title, type: dto.type, lawyerId: dto.lawyerId },
    });
    await this.audit.log(user, 'matter.updated', 'Matter', id);
    return this.findOne(user, id);
  }

  /** Cambia el estado validando la transición contra la máquina de estados. */
  async changeStatus(user: RequestUser, id: string, next: MatterStatus) {
    const matter = await this.findOne(user, id);
    if (matter.status === next) return matter;
    if (!canTransition(matter.status as MatterStatus, next)) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${matter.status} → ${next}.`,
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
