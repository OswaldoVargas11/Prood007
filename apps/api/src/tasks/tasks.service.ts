import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskFromDeadlineDto } from './dto/create-task-from-deadline.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertMatterInTenant(user: RequestUser, matterId: string): Promise<void> {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
  }

  private async assertUserInTenant(user: RequestUser, userId: string): Promise<void> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!u) throw new BadRequestException(apiError('tasks.assigneeNotInFirm'));
  }

  private async notifyAssignee(
    user: RequestUser,
    task: { id: string; title: string; assigneeId: string | null },
  ) {
    if (task.assigneeId && task.assigneeId !== user.userId) {
      await this.notifications.create({
        tenantId: user.tenantId,
        userId: task.assigneeId,
        type: 'task.assigned',
        title: `Nueva tarea: ${task.title}`,
        data: { taskId: task.id },
      });
    }
  }

  async create(user: RequestUser, dto: CreateTaskDto) {
    if (dto.matterId) await this.assertMatterInTenant(user, dto.matterId);
    if (dto.assigneeId) await this.assertUserInTenant(user, dto.assigneeId);
    const task = await this.prisma.task.create({
      data: {
        tenantId: user.tenantId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        matterId: dto.matterId,
        assigneeId: dto.assigneeId,
      },
    });
    await this.audit.log(user, 'task.created', 'Task', task.id);
    await this.notifyAssignee(user, task);
    return task;
  }

  /** Crea una tarea con la fecha límite calculada por el ComplianceProvider (plazo procesal). */
  async createFromDeadline(user: RequestUser, dto: CreateTaskFromDeadlineDto) {
    if (dto.matterId) await this.assertMatterInTenant(user, dto.matterId);
    if (dto.assigneeId) await this.assertUserInTenant(user, dto.assigneeId);

    // Festivos locales del despacho (se suman a los nacionales en el cómputo del plazo).
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { holidays: true },
    });
    const extraHolidays = Array.isArray(tenant.holidays)
      ? (tenant.holidays as { date?: string }[])
          .map((h) => h?.date)
          .filter((d): d is string => typeof d === 'string')
      : [];

    const provider = this.compliance.forJurisdiction(user.jurisdiction);
    const deadline = provider.getProceduralDeadlines({
      deadlineType: dto.deadlineType,
      startDate: dto.startDate,
      days: dto.days,
      extraHolidays,
    });

    const task = await this.prisma.task.create({
      data: {
        tenantId: user.tenantId,
        title: dto.title?.trim() || `Plazo: ${dto.deadlineType}`,
        dueDate: new Date(deadline.dueDate),
        deadlineType: dto.deadlineType,
        isProcedural: true,
        matterId: dto.matterId,
        assigneeId: dto.assigneeId,
      },
    });
    await this.audit.log(user, 'task.created_from_deadline', 'Task', task.id, {
      deadlineType: dto.deadlineType,
      dueDate: deadline.dueDate,
      holidaysApplied: deadline.holidaysApplied,
    });
    await this.notifyAssignee(user, task);
    return { task, deadline };
  }

  async findAll(
    user: RequestUser,
    filters: { matterId?: string; status?: TaskStatus; assigneeId?: string } = {},
  ) {
    return this.prisma.task.findMany({
      where: {
        tenantId: user.tenantId,
        ...(filters.matterId ? { matterId: filters.matterId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async findOne(user: RequestUser, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!task) throw new NotFoundException(apiError('tasks.notFound'));
    return task;
  }

  async update(user: RequestUser, id: string, dto: UpdateTaskDto) {
    await this.findOne(user, id);
    if (dto.assigneeId) await this.assertUserInTenant(user, dto.assigneeId);
    await this.prisma.task.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assigneeId: dto.assigneeId,
      },
    });
    await this.audit.log(user, 'task.updated', 'Task', id);
    return this.findOne(user, id);
  }

  async remove(user: RequestUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.task.deleteMany({ where: { id, tenantId: user.tenantId } });
    await this.audit.log(user, 'task.deleted', 'Task', id);
    return { success: true };
  }
}
