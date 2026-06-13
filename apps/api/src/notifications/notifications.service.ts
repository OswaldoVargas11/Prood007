import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';

/**
 * Notificaciones persistidas (la entrega en tiempo real por WebSocket se añade en E7).
 * Siempre acotadas por tenant.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    tenantId: string;
    userId: string;
    type: string;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.notification.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data ? (params.data as object) : undefined,
      },
    });
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
