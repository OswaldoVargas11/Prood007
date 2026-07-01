import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ChainDeadlineDto } from './dto/chain-deadline.dto';
import { lexnetConfig, lexnetEnabled } from './lexnet.config';

const MATTER_SELECT = { matter: { select: { id: true, reference: true, title: true } } };

/**
 * Bandeja de notificaciones judiciales (LexNET-lite). Registra el acto recibido del juzgado y, desde su
 * fecha de recepción, encadena el plazo procesal reutilizando TasksService (días hábiles + festivos del
 * despacho). El conector LexNET automático está GATED (ver lexnet.config). Acotado al tenant por RLS.
 */
@Injectable()
export class JudicialNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  list(user: RequestUser, filters: { matterId?: string; pending?: boolean }) {
    return this.prisma.judicialNotification.findMany({
      where: {
        tenantId: user.tenantId,
        ...(filters.matterId ? { matterId: filters.matterId } : {}),
        ...(filters.pending ? { taskId: null } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      include: MATTER_SELECT,
      take: 200,
    });
  }

  async create(user: RequestUser, dto: CreateNotificationDto) {
    if (dto.matterId) await this.assertMatter(user, dto.matterId);
    return this.prisma.judicialNotification.create({
      data: {
        tenantId: user.tenantId,
        matterId: dto.matterId || null,
        source: 'MANUAL',
        court: dto.court?.trim() || null,
        procedureRef: dto.procedureRef?.trim() || null,
        type: dto.type?.trim() || null,
        subject: dto.subject.trim(),
        receivedAt: new Date(dto.receivedAt),
        createdById: user.userId,
      },
      include: MATTER_SELECT,
    });
  }

  /** Calcula el plazo procesal desde la fecha de recepción y crea la tarea, enlazándola a la notificación. */
  async chainDeadline(user: RequestUser, id: string, dto: ChainDeadlineDto) {
    const notif = await this.prisma.judicialNotification.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!notif) throw new NotFoundException({ messageKey: 'judicial.notFound' });

    const result = await this.tasks.createFromDeadline(user, {
      deadlineType: dto.deadlineType,
      startDate: notif.receivedAt.toISOString(),
      days: dto.days,
      matterId: notif.matterId ?? undefined,
      assigneeId: dto.assigneeId,
      title: dto.title,
      notificationRef: notif.procedureRef ?? notif.subject.slice(0, 100),
    });

    await this.prisma.judicialNotification.update({
      where: { id },
      data: { taskId: result.task.id },
    });
    return result;
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.judicialNotification.deleteMany({
      where: { id, tenantId: user.tenantId },
    });
    if (res.count === 0) throw new NotFoundException({ messageKey: 'judicial.notFound' });
    return { success: true };
  }

  connectorStatus() {
    return lexnetConfig();
  }

  /** Ingesta automática desde LexNET. GATED: sin acreditación/endpoint, no-op (ver docs/setup/LEXNET_SETUP.md). */
  sync() {
    if (!lexnetEnabled()) return { enabled: false, imported: 0 };
    // Conector real pendiente de acreditación oficial ante el CGPJ; punto de extensión documentado.
    return { enabled: true, imported: 0 };
  }

  private async assertMatter(user: RequestUser, matterId: string) {
    const m = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!m) throw new BadRequestException(apiError('matters.notInFirm'));
  }
}
