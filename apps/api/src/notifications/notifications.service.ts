import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { RequestUser } from '../auth/auth.types';

/**
 * Notificaciones persistidas + entrega en tiempo real por WebSocket (sala `user:<id>`).
 * Siempre acotadas por tenant.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(params: {
    tenantId: string;
    userId: string;
    type: string;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data ? (params.data as object) : undefined,
      },
    });
    this.realtime.emitToUser(params.userId, 'notification:new', notification);
  }

  async listForUser(user: RequestUser, onlyUnread = false) {
    return this.prisma.notification.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.userId,
        ...(onlyUnread ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(user: RequestUser, id: string): Promise<{ success: boolean }> {
    await this.prisma.notification.updateMany({
      where: { id, tenantId: user.tenantId, userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
