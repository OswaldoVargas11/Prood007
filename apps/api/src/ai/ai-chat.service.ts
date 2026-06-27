import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

const STAFF_ROLES = [Role.FIRM_ADMIN, Role.LAWYER];
/** Máximo de conversaciones que se listan en el historial del dock. */
const LIST_LIMIT = 50;
/** Máximo de mensajes que se restauran al abrir una conversación (turnos largos quedan acotados). */
const MESSAGES_LIMIT = 200;

/** Un turno a persistir: rol + texto + UI rica opcional (tarjetas/traza) en `meta`. */
export interface TurnInput {
  role: 'user' | 'assistant';
  content: string;
  meta?: unknown;
}

/**
 * Persistencia del chat del asistente agéntico (Zora). Cada conversación es PRIVADA del usuario que la
 * inició: además del aislamiento por tenant (RLS), el servicio filtra siempre por `userId` para que un
 * letrado no vea las conversaciones de otro. Solo staff (FIRM_ADMIN/LAWYER); los clientes nunca usan la IA.
 * No llama al modelo: solo CRUD sobre lo que el dock ya generó en cada turno (la generación va por
 * `/ai/agent/stream`).
 */
@Injectable()
export class AiChatService {
  constructor(private readonly prisma: PrismaService) {}

  private assertStaff(user: RequestUser): void {
    if (!user.roles.some((r) => STAFF_ROLES.includes(r as Role))) {
      throw new ForbiddenException(apiError('auth.forbidden'));
    }
  }

  /** Deriva un título legible del primer mensaje del usuario (recortado). */
  private titleFrom(text: string): string {
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean || 'Conversación';
  }

  /** Historial del usuario (sus conversaciones con Zora), por actividad reciente. */
  async list(user: RequestUser) {
    this.assertStaff(user);
    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
      select: { id: true, title: true, updatedAt: true },
    });
    return convs.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  /** Carga una conversación del usuario con sus mensajes (para restaurar el chat en el dock). */
  async get(user: RequestUser, id: string) {
    this.assertStaff(user);
    const conv = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId },
      select: { id: true, title: true },
    });
    if (!conv) throw new NotFoundException(apiError('ai.conversationNotFound'));
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { tenantId: user.tenantId, conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: MESSAGES_LIMIT,
      select: { role: true, content: true, meta: true },
    });
    return {
      id: conv.id,
      title: conv.title,
      messages: messages.map((m) => ({ role: m.role, content: m.content, meta: m.meta ?? null })),
    };
  }

  /** Crea una conversación con los mensajes iniciales de su primer turno. Devuelve su id y título. */
  async create(user: RequestUser, turns: TurnInput[]) {
    this.assertStaff(user);
    const first = turns.find((t) => t.role === 'user');
    const title = this.titleFrom(first?.content ?? '');
    const conv = await this.prisma.aiConversation.create({
      data: { tenantId: user.tenantId, userId: user.userId, title },
      select: { id: true, title: true },
    });
    await this.append(user, conv.id, turns);
    return { id: conv.id, title: conv.title };
  }

  /** Añade los mensajes de un turno a una conversación del usuario y la marca como activa (updatedAt). */
  async append(user: RequestUser, id: string, turns: TurnInput[]) {
    this.assertStaff(user);
    const conv = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException(apiError('ai.conversationNotFound'));
    if (turns.length > 0) {
      await this.prisma.aiChatMessage.createMany({
        data: turns.map((t) => ({
          tenantId: user.tenantId,
          conversationId: id,
          role: t.role,
          content: t.content,
          meta: (t.meta ?? undefined) as never,
        })),
      });
      await this.prisma.aiConversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    }
    return { id };
  }

  /** Borra una conversación del usuario (y en cascada sus mensajes). */
  async remove(user: RequestUser, id: string) {
    this.assertStaff(user);
    const conv = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException(apiError('ai.conversationNotFound'));
    await this.prisma.aiConversation.delete({ where: { id } });
    return { id };
  }
}
