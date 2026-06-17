import { Injectable, Logger } from '@nestjs/common';
import { TaskStatus } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { addDaysUtc, startOfTodayUtc } from '../ledger/overdue.util';
import type { RequestUser } from '../auth/auth.types';

/**
 * Ventanas de antelación (en días) en las que se avisa de un plazo próximo. Ordenadas de la más
 * holgada a la más urgente: el avisador notifica como mucho una por barrido (la más urgente que
 * acabe de entrar) y deduplica con `lastReminderWindow`.
 */
export const DEFAULT_REMINDER_WINDOWS = [7, 1] as const;

/** Estados de tarea que NO requieren recordatorio (ya cerrada). */
const CLOSED_STATUSES: TaskStatus[] = [TaskStatus.DONE, TaskStatus.CANCELLED];

/** Resumen de una corrida del avisador de plazos sobre un tenant. */
export interface DeadlineReminderRunSummary {
  evaluated: number;
  reminded: number;
  skipped: number;
}

/** Actor de la corrida: un usuario del despacho (manual) o el sistema (cron). */
type ReminderActor = RequestUser | { tenantId: string };

/**
 * Avisador de plazos próximos. Reutilizable por el cron diario (barrido multi-tenant) y por el
 * endpoint manual del despacho. In-app únicamente (vía `NotificationsService`); el envío por correo
 * será otro workstream — el `data` de la notificación lleva ya lo necesario para extenderlo.
 */
@Injectable()
export class DeadlineRemindersService {
  private readonly logger = new Logger(DeadlineRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Disparo manual desde el despacho ("recordar plazos ahora"), acotado al tenant del usuario. */
  async runForTenant(user: RequestUser): Promise<DeadlineReminderRunSummary> {
    const summary = await this.evaluateTenant(user.tenantId, { actor: user });
    await this.audit.log(user, 'task.reminders_run', 'Tenant', user.tenantId, { ...summary });
    return summary;
  }

  /**
   * Núcleo reutilizable (también por el cron). Busca tareas NO cerradas con `dueDate` dentro de
   * alguna ventana y avisa al asignado y/o al abogado responsable del expediente. Idempotente por
   * (tarea, fecha límite, ventana): un segundo barrido el mismo día NO duplica.
   *
   * El llamador del cron lo envuelve en `runWithTenant(tenantId)` para que la RLS acote al tenant.
   */
  async evaluateTenant(
    tenantId: string,
    opts: { actor?: ReminderActor; windows?: readonly number[] } = {},
  ): Promise<DeadlineReminderRunSummary> {
    const { actor } = opts;
    const windows = opts.windows ?? DEFAULT_REMINDER_WINDOWS;

    const today = startOfTodayUtc();
    // Ventanas de la más urgente a la más holgada: para una tarea se toma la PRIMERA que aplica.
    const sortedWindows = [...windows].sort((a, b) => a - b);
    const widest = sortedWindows[sortedWindows.length - 1] ?? 0;
    // Cota superior: ninguna tarea más allá de la ventana más amplia entra. Las vencidas (dueDate en
    // el pasado) también se avisan (ventana efectiva 0 ≤ la más urgente).
    const horizon = addDaysUtc(today, widest);

    const summary: DeadlineReminderRunSummary = { evaluated: 0, reminded: 0, skipped: 0 };

    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        dueDate: { not: null, lte: horizon },
        status: { notIn: CLOSED_STATUSES },
      },
      include: { matter: { select: { lawyerId: true } } },
    });
    summary.evaluated = tasks.length;

    for (const task of tasks) {
      const dueDate = task.dueDate as Date;
      // Días naturales que faltan (puede ser negativo si ya está vencida).
      const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / 86_400_000);
      // Ventana aplicable: la más urgente (menor) cuyo umbral ya alcanzó la tarea.
      const window = sortedWindows.find((w) => daysUntilDue <= w);
      if (window === undefined) continue;

      // Dedup: si dueDate no cambió y ya avisamos esta ventana (o una más urgente), saltar.
      const sameDueDate =
        task.lastRemindedForDueDate !== null &&
        task.lastRemindedForDueDate.getTime() === dueDate.getTime();
      if (sameDueDate && task.lastReminderWindow !== null && task.lastReminderWindow <= window) {
        summary.skipped++;
        continue;
      }

      const recipients = new Set<string>();
      if (task.assigneeId) recipients.add(task.assigneeId);
      if (task.matter?.lawyerId) recipients.add(task.matter.lawyerId);
      // Sin destinatarios (tarea sin asignar ni expediente con responsable): no hay a quién avisar,
      // pero igual sellamos para no reevaluarla cada día.
      for (const userId of recipients) {
        await this.notifications.create({
          tenantId,
          userId,
          type: 'task.deadline_due_soon',
          title: this.buildTitle(task.title, daysUntilDue),
          body: this.buildBody(daysUntilDue),
          data: {
            taskId: task.id,
            matterId: task.matterId,
            dueDate: dueDate.toISOString(),
            daysUntilDue,
            window,
          },
        });
      }

      await this.prisma.task.update({
        where: { id: task.id },
        data: { lastRemindedForDueDate: dueDate, lastReminderWindow: window },
      });

      if (actor) {
        await this.audit.log(actor, 'task.deadline_reminder_sent', 'Task', task.id, {
          dueDate: dueDate.toISOString(),
          daysUntilDue,
          window,
          recipients: recipients.size,
        });
      }
      summary.reminded++;
    }

    return summary;
  }

  private buildTitle(taskTitle: string, daysUntilDue: number): string {
    if (daysUntilDue < 0) return `Plazo vencido: ${taskTitle}`;
    if (daysUntilDue === 0) return `Plazo hoy: ${taskTitle}`;
    if (daysUntilDue === 1) return `Plazo mañana: ${taskTitle}`;
    return `Plazo en ${daysUntilDue} días: ${taskTitle}`;
  }

  private buildBody(daysUntilDue: number): string {
    if (daysUntilDue < 0) return 'Esta tarea tiene un plazo ya vencido pendiente de cierre.';
    if (daysUntilDue <= 1) return 'Esta tarea vence de forma inminente.';
    return 'Esta tarea tiene un plazo próximo.';
  }
}
