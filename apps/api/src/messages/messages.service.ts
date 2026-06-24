import { Injectable } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { assertMatterChatAccess } from './matter-access';
import type { RequestUser } from '../auth/auth.types';

/**
 * Chat por expediente. La participación se restringe al EQUIPO asignado (líder + colaboradores) y al
 * cliente del expediente (ver `assertMatterChatAccess`). Acuses de lectura persistidos en MatterReadState.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(user: RequestUser, matterId: string, body: string) {
    await assertMatterChatAccess(this.prisma, user, matterId);
    const message = await this.prisma.message.create({
      data: { tenantId: user.tenantId, matterId, authorId: user.userId, body },
      include: { author: { select: { id: true, fullName: true } } },
    });
    this.realtime.emitToMatter(matterId, 'message:new', message);
    return message;
  }

  async list(user: RequestUser, matterId: string) {
    await assertMatterChatAccess(this.prisma, user, matterId);
    return this.prisma.message.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, fullName: true } } },
      take: 500,
    });
  }

  /** Marca el chat del expediente como leído por el usuario (ahora) y avisa a la sala. */
  async markRead(user: RequestUser, matterId: string) {
    await assertMatterChatAccess(this.prisma, user, matterId);
    const now = new Date();
    await this.prisma.matterReadState.upsert({
      where: { matterId_userId: { matterId, userId: user.userId } },
      create: { tenantId: user.tenantId, matterId, userId: user.userId, lastReadAt: now },
      update: { lastReadAt: now },
    });
    this.realtime.emitToMatter(matterId, 'read:update', {
      matterId,
      userId: user.userId,
      lastReadAt: now.toISOString(),
    });
    return { matterId, lastReadAt: now.toISOString() };
  }

  /** Acuses de lectura del expediente: por cada participante con estado, su `lastReadAt` y nombre. */
  async reads(user: RequestUser, matterId: string) {
    await assertMatterChatAccess(this.prisma, user, matterId);
    const states = await this.prisma.matterReadState.findMany({
      where: { tenantId: user.tenantId, matterId },
      select: { userId: true, lastReadAt: true },
    });
    if (states.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId, id: { in: states.map((s) => s.userId) } },
      select: { id: true, fullName: true },
    });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return states.map((s) => ({
      userId: s.userId,
      fullName: names.get(s.userId) ?? null,
      lastReadAt: s.lastReadAt.toISOString(),
    }));
  }

  /** Filtro de expedientes con acceso al chat según rol (para la bandeja de conversaciones). */
  private accessWhere(user: RequestUser): Prisma.MatterWhereInput {
    if (user.roles.includes(Role.FIRM_ADMIN)) return { tenantId: user.tenantId };
    if (user.roles.includes(Role.LAWYER)) {
      return {
        tenantId: user.tenantId,
        OR: [{ lawyerId: user.userId }, { assignments: { some: { userId: user.userId } } }],
      };
    }
    return { tenantId: user.tenantId, client: { userId: user.userId } };
  }

  /** Conversaciones (una por expediente con mensajes) con último mensaje y nº de no leídos. */
  private async conversations(user: RequestUser) {
    const matters = await this.prisma.matter.findMany({
      where: { ...this.accessWhere(user), messages: { some: {} } },
      select: {
        id: true,
        reference: true,
        title: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            body: true,
            createdAt: true,
            authorId: true,
            author: { select: { fullName: true } },
          },
        },
      },
      take: 100,
    });
    if (matters.length === 0) return [];
    const reads = await this.prisma.matterReadState.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.userId,
        matterId: { in: matters.map((m) => m.id) },
      },
      select: { matterId: true, lastReadAt: true },
    });
    const lastReadByMatter = new Map(reads.map((r) => [r.matterId, r.lastReadAt]));

    const out = [];
    for (const m of matters) {
      const lastRead = lastReadByMatter.get(m.id);
      const unread = await this.prisma.message.count({
        where: {
          tenantId: user.tenantId,
          matterId: m.id,
          authorId: { not: user.userId },
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        },
      });
      const last = m.messages[0];
      out.push({
        matterId: m.id,
        reference: m.reference,
        title: m.title,
        last: last
          ? {
              body: last.body,
              createdAt: last.createdAt.toISOString(),
              authorName: last.author.fullName,
            }
          : null,
        unread,
      });
    }
    return out.sort((a, b) => (b.last?.createdAt ?? '').localeCompare(a.last?.createdAt ?? ''));
  }

  /** Bandeja de conversaciones del usuario. */
  async listConversations(user: RequestUser) {
    return this.conversations(user);
  }

  /** Total de mensajes no leídos del usuario (para el badge del sidebar). */
  async unreadCount(user: RequestUser) {
    const convs = await this.conversations(user);
    return { count: convs.reduce((s, c) => s + c.unread, 0) };
  }
}
