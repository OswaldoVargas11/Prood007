import { Injectable, Logger } from '@nestjs/common';
import { DealMilestoneKind } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { addDaysUtc, startOfTodayUtc } from '../ledger/overdue.util';
import type { RequestUser } from '../auth/auth.types';
import {
  CLOSED_MILESTONE_STATUSES,
  daysUntil,
  isPriorityMilestoneKind,
  milestoneReminderWindow,
  shouldRemind,
  WIDEST_MILESTONE_WINDOW,
} from './milestone-reminders.logic';

/** Resumen de una corrida del avisador de hitos sobre un tenant. */
export interface MilestoneReminderRunSummary {
  evaluated: number;
  reminded: number;
  skipped: number;
}

/** Actor de la corrida: un usuario del despacho (manual) o el sistema (cron). */
type ReminderActor = RequestUser | { tenantId: string };

/**
 * Avisador de plazos del calendario de operación (T-3). Detecta `DealMilestone` no cumplidos con
 * `targetDate` dentro de una ventana de antelación (incluidos los YA vencidos) y emite un recordatorio
 * IN-APP al grupo de trabajo INTERNO del despacho (responsable del expediente + colaboradores).
 *
 * Reutiliza la infraestructura de notificación existente (`NotificationsService`): NO abre un canal
 * nuevo y, deliberadamente, NO envía correo — el aviso queda dentro de la app y nunca llega a partes
 * externas, respetando la privacidad del data room. Idempotente por (hito, fecha objetivo, ventana).
 */
@Injectable()
export class DealMilestoneRemindersService {
  private readonly logger = new Logger(DealMilestoneRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Disparo manual desde el despacho ("recordar hitos ahora"), acotado al tenant del usuario. */
  async runForTenant(user: RequestUser): Promise<MilestoneReminderRunSummary> {
    const summary = await this.evaluateTenant(user.tenantId, { actor: user });
    await this.audit.log(user, 'deal.milestone_reminders_run', 'Tenant', user.tenantId, {
      ...summary,
    });
    return summary;
  }

  /**
   * Núcleo reutilizable (también por el cron). Busca hitos NO cumplidos con `targetDate` dentro de la
   * ventana más amplia posible y avisa al grupo interno. Idempotente: un segundo barrido el mismo día
   * NO duplica. El llamador del cron lo envuelve en `runWithTenant(tenantId)` para que la RLS acote.
   */
  async evaluateTenant(
    tenantId: string,
    opts: { actor?: ReminderActor } = {},
  ): Promise<MilestoneReminderRunSummary> {
    const { actor } = opts;
    const today = startOfTodayUtc();
    // Cota superior: ningún hito más allá de la ventana más amplia (la de los prioritarios) entra. Los
    // vencidos (targetDate en el pasado) también, por la ventana efectiva 0.
    const horizon = addDaysUtc(today, WIDEST_MILESTONE_WINDOW);

    const summary: MilestoneReminderRunSummary = { evaluated: 0, reminded: 0, skipped: 0 };

    const milestones = await this.prisma.dealMilestone.findMany({
      where: {
        tenantId,
        status: { notIn: [...CLOSED_MILESTONE_STATUSES] },
        targetDate: { lte: horizon },
      },
      include: {
        matter: {
          select: {
            reference: true,
            lawyerId: true,
            assignments: { select: { userId: true } },
          },
        },
      },
    });
    summary.evaluated = milestones.length;

    for (const m of milestones) {
      // El cliente Prisma tipa `kind` con su propio enum, nominalmente distinto del de `@legalflow/domain`
      // (mismos valores). Se reconcilia con un cast, igual que el resto del módulo deal.
      const kind = m.kind as DealMilestoneKind;
      const window = milestoneReminderWindow(m.targetDate, kind, today);
      if (window === null) continue;

      if (
        !shouldRemind({
          window,
          targetDate: m.targetDate,
          lastRemindedForTargetDate: m.lastRemindedForTargetDate,
          lastReminderWindow: m.lastReminderWindow,
        })
      ) {
        summary.skipped++;
        continue;
      }

      const daysUntilDue = daysUntil(m.targetDate, today);
      const priority = isPriorityMilestoneKind(kind);

      // Destinatarios: SOLO el grupo de trabajo INTERNO (responsable + colaboradores asignados). Nunca
      // partes externas — el aviso es staff-only y no abre el data room.
      const recipients = new Set<string>();
      if (m.matter?.lawyerId) recipients.add(m.matter.lawyerId);
      for (const a of m.matter?.assignments ?? []) recipients.add(a.userId);

      for (const userId of recipients) {
        await this.notifications.create({
          tenantId,
          userId,
          type: 'deal.milestone_due_soon',
          title: this.buildTitle(m.title, daysUntilDue, priority),
          body: this.buildBody(daysUntilDue, priority),
          data: {
            milestoneId: m.id,
            matterId: m.matterId,
            kind: m.kind,
            targetDate: m.targetDate.toISOString(),
            daysUntilDue,
            window,
            priority,
          },
        });
      }

      // Sellar SIEMPRE (aunque no haya destinatarios) para no reevaluar el mismo plazo cada día.
      await this.prisma.dealMilestone.update({
        where: { id: m.id },
        data: { lastRemindedForTargetDate: m.targetDate, lastReminderWindow: window },
      });

      if (actor) {
        await this.audit.log(actor, 'deal.milestone_reminder_sent', 'DealMilestone', m.id, {
          targetDate: m.targetDate.toISOString(),
          daysUntilDue,
          window,
          priority,
          recipients: recipients.size,
        });
      }
      summary.reminded++;
    }

    return summary;
  }

  private buildTitle(title: string, daysUntilDue: number, priority: boolean): string {
    const prefix = priority ? '⚠️ ' : '';
    if (daysUntilDue < 0) return `${prefix}Hito vencido: ${title}`;
    if (daysUntilDue === 0) return `${prefix}Hito hoy: ${title}`;
    if (daysUntilDue === 1) return `${prefix}Hito mañana: ${title}`;
    return `${prefix}Hito en ${daysUntilDue} días: ${title}`;
  }

  private buildBody(daysUntilDue: number, priority: boolean): string {
    const tail = priority
      ? ' Su incumplimiento tiene consecuencias contractuales (longstop / plazo de condiciones).'
      : '';
    if (daysUntilDue < 0) return `Este hito de la operación está vencido.${tail}`;
    if (daysUntilDue <= 1) return `Este hito de la operación vence de forma inminente.${tail}`;
    return `Este hito de la operación tiene un plazo próximo.${tail}`;
  }
}
