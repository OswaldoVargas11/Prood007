import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DunningChannel,
  DunningReminderStatus,
  DunningSeverity,
  Jurisdiction,
} from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SETTLED_STATUSES, addDaysUtc, startOfTodayUtc } from '../ledger/overdue.util';
import {
  DUNNING_CHANNELS,
  DunningChannelDispatcher,
  DunningDeliveryInput,
} from './channels/dunning-channel';
import { defaultDunningRules } from './dunning.policy';
import type { RequestUser } from '../auth/auth.types';

/** Regla efectiva del calendario, con el id de la `DunningRule` que la originó (null si es default). */
interface EffectiveRule {
  offsetDays: number;
  severity: DunningSeverity;
  channel: DunningChannel;
  ruleId: string | null;
}

/** Resumen de una corrida de dunning (manual o por cron). */
export interface DunningRunSummary {
  evaluated: number;
  created: number;
  delivered: number;
  skipped: number;
  failed: number;
}

/** Actor de la corrida: un usuario del despacho (manual) o el sistema (cron). */
type DunningActor = RequestUser | { tenantId: string };

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);
  private readonly channels: Map<DunningChannel, DunningChannelDispatcher>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(DUNNING_CHANNELS) channels: DunningChannelDispatcher[],
  ) {
    this.channels = new Map(channels.map((c) => [c.channel, c]));
  }

  /**
   * Disparo manual desde el despacho ("recordar ahora"), acotado al tenant del usuario. Persigue las
   * facturas vencidas según el calendario de reglas y genera/entrega los recordatorios pendientes.
   */
  async runForTenant(user: RequestUser): Promise<DunningRunSummary> {
    const summary = await this.evaluateTenant(user.tenantId, user.jurisdiction, user);
    await this.audit.log(user, 'dunning.run', 'Tenant', user.tenantId, { ...summary });
    return summary;
  }

  /**
   * Núcleo reutilizable (también por el cron de D3). Evalúa las facturas vencidas del tenant contra el
   * calendario efectivo y asegura un recordatorio por cada etapa ya cumplida, de forma IDEMPOTENTE.
   * `actor` es opcional → corridas del sistema sin usuario.
   */
  async evaluateTenant(
    tenantId: string,
    jurisdiction: Jurisdiction,
    actor?: DunningActor,
  ): Promise<DunningRunSummary> {
    const today = startOfTodayUtc();
    const rules = await this.effectiveRules(tenantId, jurisdiction);
    const summary: DunningRunSummary = {
      evaluated: 0,
      created: 0,
      delivered: 0,
      skipped: 0,
      failed: 0,
    };
    if (!rules.length) return summary;

    // Facturas vencidas y no liquidadas (mismo criterio que la vista "Vencidas"): dueDate en el pasado.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        dueDate: { not: null, lt: today },
        status: { notIn: SETTLED_STATUSES },
      },
      include: { client: { select: { id: true, name: true } } },
    });
    summary.evaluated = invoices.length;

    for (const inv of invoices) {
      const dueDate = inv.dueDate as Date;
      for (const rule of rules) {
        // La etapa solo aplica cuando han pasado `offsetDays` desde el vencimiento.
        if (addDaysUtc(dueDate, rule.offsetDays).getTime() > today.getTime()) continue;
        const outcome = await this.ensureReminder(
          tenantId,
          {
            id: inv.id,
            number: inv.number,
            total: inv.total.toString(),
            currency: inv.currency,
            dueDate,
          },
          { id: inv.client.id, name: inv.client.name },
          rule,
          actor,
        );
        if (outcome === 'delivered') {
          summary.created++;
          summary.delivered++;
        } else if (outcome === 'skipped') {
          summary.created++;
          summary.skipped++;
        } else if (outcome === 'failed') {
          summary.created++;
          summary.failed++;
        }
        // 'exists' → ya estaba (corrida previa o doble clic): no cuenta como nuevo.
      }
    }
    return summary;
  }

  /** Lista los recordatorios del tenant (para la línea de tiempo del despacho; PR-D4). */
  async listReminders(user: RequestUser, invoiceId?: string) {
    return this.prisma.dunningReminder.findMany({
      where: { tenantId: user.tenantId, ...(invoiceId ? { invoiceId } : {}) },
      orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  /** Reglas configuradas por el despacho; si no hay ninguna activa, el calendario por defecto. */
  private async effectiveRules(
    tenantId: string,
    jurisdiction: Jurisdiction,
  ): Promise<EffectiveRule[]> {
    const configured = await this.prisma.dunningRule.findMany({
      where: { tenantId, active: true },
      orderBy: { offsetDays: 'asc' },
    });
    if (configured.length) {
      return configured.map((r) => ({
        offsetDays: r.offsetDays,
        severity: r.severity as DunningSeverity,
        channel: r.channel as DunningChannel,
        ruleId: r.id,
      }));
    }
    return defaultDunningRules(jurisdiction).map((r) => ({ ...r, ruleId: null }));
  }

  /**
   * Asegura el recordatorio de una etapa (factura + offset) y lo entrega por su canal. La unicidad
   * `@@unique([tenantId, invoiceId, offsetDays])` es el ancla de idempotencia: si ya existe (doble
   * clic / corrida previa), la colisión P2002 se captura con gracia y NO se crea un segundo ni se
   * lanza 500.
   */
  private async ensureReminder(
    tenantId: string,
    invoice: DunningDeliveryInput['invoice'],
    client: DunningDeliveryInput['client'],
    rule: EffectiveRule,
    actor?: DunningActor,
  ): Promise<'delivered' | 'skipped' | 'failed' | 'exists'> {
    let reminder;
    try {
      reminder = await this.prisma.dunningReminder.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          ruleId: rule.ruleId,
          offsetDays: rule.offsetDays,
          severity: rule.severity,
          channel: rule.channel,
          status: DunningReminderStatus.SCHEDULED,
          scheduledFor: addDaysUtc(invoice.dueDate as Date, rule.offsetDays),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return 'exists';
      }
      throw err;
    }

    const dispatcher = this.channels.get(rule.channel);
    if (!dispatcher || !dispatcher.isEnabled()) {
      // Canal aún no disponible (EMAIL/SMS en Fase 2): se deja registrado como SKIPPED, no se pierde.
      await this.prisma.dunningReminder.update({
        where: { id: reminder.id },
        data: {
          status: DunningReminderStatus.SKIPPED,
          metadata: { reason: 'channel_unavailable' },
        },
      });
      return 'skipped';
    }

    try {
      await dispatcher.deliver({
        tenantId,
        invoice,
        client,
        severity: rule.severity,
        offsetDays: rule.offsetDays,
      });
      await this.prisma.dunningReminder.update({
        where: { id: reminder.id },
        data: { status: DunningReminderStatus.SENT, sentAt: new Date() },
      });
      await this.audit.log(
        actor ?? { tenantId },
        'dunning.reminder_sent',
        'DunningReminder',
        reminder.id,
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          offsetDays: rule.offsetDays,
          severity: rule.severity,
          channel: rule.channel,
        },
      );
      return 'delivered';
    } catch (err) {
      this.logger.error(
        `Fallo al entregar recordatorio ${reminder.id} (canal ${rule.channel})`,
        err as Error,
      );
      await this.prisma.dunningReminder.update({
        where: { id: reminder.id },
        data: { status: DunningReminderStatus.FAILED, metadata: { error: (err as Error).message } },
      });
      return 'failed';
    }
  }
}
