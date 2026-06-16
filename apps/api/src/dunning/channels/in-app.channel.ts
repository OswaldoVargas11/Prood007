import { Injectable } from '@nestjs/common';
import { DunningChannel, DunningSeverity } from '@legalflow/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DunningChannelDispatcher, DunningDeliveryInput } from './dunning-channel';

/** Encabezado del aviso según la severidad del escalado (texto del servidor; la UI localiza por `data`). */
const SEVERITY_TITLE: Record<DunningSeverity, string> = {
  [DunningSeverity.REMINDER]: 'Recordatorio de pago',
  [DunningSeverity.WARNING]: 'Factura vencida',
  [DunningSeverity.FINAL]: 'Aviso final de factura vencida',
};

/**
 * Canal IN_APP: avisa a los administradores del despacho de que hay una factura vencida que recordar
 * (Notificación persistida + realtime). El recordatorio visible al cliente en el portal lo resuelve la
 * UI leyendo los `DunningReminder` (PR-D5); este canal cubre el "aviso al despacho" de la Fase 1.
 */
@Injectable()
export class InAppChannel implements DunningChannelDispatcher {
  readonly channel = DunningChannel.IN_APP;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async deliver(input: DunningDeliveryInput): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        roles: { some: { role: { code: 'FIRM_ADMIN' } } },
      },
      select: { id: true },
    });
    const title = `${SEVERITY_TITLE[input.severity]}: ${input.invoice.number}`;
    const body = `Factura ${input.invoice.number} de ${input.client.name} vencida (${input.invoice.total} ${input.invoice.currency}).`;
    await Promise.all(
      admins.map((a) =>
        this.notifications.create({
          tenantId: input.tenantId,
          userId: a.id,
          type: 'dunning.reminder',
          title,
          body,
          data: {
            invoiceId: input.invoice.id,
            clientId: input.client.id,
            severity: input.severity,
            offsetDays: input.offsetDays,
          },
        }),
      ),
    );
  }
}
