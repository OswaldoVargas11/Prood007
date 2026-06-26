import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

const STAFF_ROLES = [Role.FIRM_ADMIN, Role.LAWYER];
/** Centinela del canal «General» (uno por despacho) en `Conversation.directKey`. */
const GENERAL_KEY = '__general__';

interface ConversationRow {
  id: string;
  kind: 'DIRECT' | 'CHANNEL';
  title: string | null;
  directKey: string | null;
  members: { userId: string }[];
}

/**
 * Mensajería interna del despacho (chat social del staff): DM 1:1 + canal «General». Independiente del
 * chat por expediente (MessagesService). SOLO staff (FIRM_ADMIN/LAWYER); los clientes quedan fuera (el
 * controlador lo restringe con @Roles y aquí se re-comprueba). Aislamiento por tenant con RLS.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private assertStaff(user: RequestUser): void {
    if (!user.roles.some((r) => STAFF_ROLES.includes(r as Role))) {
      throw new ForbiddenException(apiError('auth.forbidden'));
    }
  }

  /** Clave canónica de un DM 1:1 (independiente del orden de los dos usuarios). */
  private directKeyFor(a: string, b: string): string {
    return [a, b].sort().join(':');
  }

  /** Staff del despacho para el directorio del dock (excluye clientes). */
  async directory(user: RequestUser) {
    this.assertStaff(user);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: STAFF_ROLES } } } },
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, isSelf: u.id === user.userId }));
  }

  /** Garantiza el canal «General» del despacho (idempotente) y la pertenencia del usuario actual. */
  private async ensureGeneral(user: RequestUser): Promise<string> {
    const channel = await this.prisma.conversation.upsert({
      where: { tenantId_directKey: { tenantId: user.tenantId, directKey: GENERAL_KEY } },
      create: {
        tenantId: user.tenantId,
        kind: 'CHANNEL',
        title: 'General',
        directKey: GENERAL_KEY,
      },
      update: {},
      select: { id: true },
    });
    await this.ensureMember(user.tenantId, channel.id, user.userId);
    return channel.id;
  }

  private async ensureMember(
    tenantId: string,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { tenantId, conversationId, userId },
      update: {},
    });
  }

  /**
   * Carga una conversación del tenant y verifica el acceso:
   *  - CHANNEL: cualquier staff del despacho (se asegura su fila de pertenencia para los no leídos);
   *  - DIRECT: solo los dos participantes.
   */
  private async loadAccessible(
    user: RequestUser,
    conversationId: string,
  ): Promise<ConversationRow> {
    this.assertStaff(user);
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: user.tenantId },
      select: {
        id: true,
        kind: true,
        title: true,
        directKey: true,
        members: { select: { userId: true } },
      },
    });
    if (!conv) throw new NotFoundException(apiError('messages.notFound'));
    if (conv.kind === 'CHANNEL') {
      if (!conv.members.some((m) => m.userId === user.userId)) {
        await this.ensureMember(user.tenantId, conv.id, user.userId);
      }
      return conv;
    }
    if (!conv.members.some((m) => m.userId === user.userId)) {
      throw new ForbiddenException(apiError('auth.forbidden'));
    }
    return conv;
  }

  /** Abre (o reutiliza) un DM 1:1 con otro usuario del despacho. Idempotente y serializado por tenant. */
  async openDirect(user: RequestUser, otherUserId: string) {
    this.assertStaff(user);
    if (otherUserId === user.userId) {
      throw new BadRequestException(apiError('messaging.selfDirect'));
    }
    const other = await this.prisma.user.findFirst({
      where: {
        id: otherUserId,
        tenantId: user.tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: STAFF_ROLES } } } },
      },
      select: { id: true, fullName: true },
    });
    if (!other) throw new NotFoundException(apiError('users.notFound'));

    const directKey = this.directKeyFor(user.userId, otherUserId);
    // Serializa el get-or-create por tenant para que dos aperturas simultáneas no creen hilos duplicados
    // (la unicidad (tenantId, directKey) ya lo blinda, pero el lock evita el error de carrera y reintenta).
    const conversationId = await tenantTransaction(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${user.tenantId + ':' + directKey}))`;
      const existing = await tx.conversation.findUnique({
        where: { tenantId_directKey: { tenantId: user.tenantId, directKey } },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await tx.conversation.create({
        data: {
          tenantId: user.tenantId,
          kind: 'DIRECT',
          directKey,
          members: {
            create: [
              { tenantId: user.tenantId, userId: user.userId },
              { tenantId: user.tenantId, userId: otherUserId },
            ],
          },
        },
        select: { id: true },
      });
      return created.id;
    });

    return {
      id: conversationId,
      kind: 'DIRECT' as const,
      title: null,
      peer: { id: other.id, fullName: other.fullName },
    };
  }

  /** Bandeja del dock: canal «General» + DMs del usuario, con último mensaje y nº de no leídos. */
  async listConversations(user: RequestUser) {
    this.assertStaff(user);
    await this.ensureGeneral(user);

    const memberships = await this.prisma.conversationMember.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { conversationId: true, lastReadAt: true },
    });
    if (memberships.length === 0) return [];
    const lastReadById = new Map(memberships.map((m) => [m.conversationId, m.lastReadAt]));
    const convIds = memberships.map((m) => m.conversationId);

    const convs = await this.prisma.conversation.findMany({
      where: { tenantId: user.tenantId, id: { in: convIds } },
      select: {
        id: true,
        kind: true,
        title: true,
        members: { select: { userId: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true, authorId: true },
        },
      },
    });

    // Resolver nombres del «otro» participante de cada DM (y autor del último mensaje no es necesario aquí).
    const peerIds = new Set<string>();
    for (const c of convs) {
      if (c.kind === 'DIRECT') {
        const peer = c.members.find((m) => m.userId !== user.userId);
        if (peer) peerIds.add(peer.userId);
      }
    }
    const peers = peerIds.size
      ? await this.prisma.user.findMany({
          where: { tenantId: user.tenantId, id: { in: [...peerIds] } },
          select: { id: true, fullName: true },
        })
      : [];
    const peerName = new Map(peers.map((p) => [p.id, p.fullName]));

    const out = [];
    for (const c of convs) {
      const lastRead = lastReadById.get(c.id) ?? null;
      const unread = await this.prisma.chatMessage.count({
        where: {
          tenantId: user.tenantId,
          conversationId: c.id,
          authorId: { not: user.userId },
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        },
      });
      const last = c.messages[0] ?? null;
      const peer =
        c.kind === 'DIRECT'
          ? (() => {
              const m = c.members.find((mm) => mm.userId !== user.userId);
              return m ? { id: m.userId, fullName: peerName.get(m.userId) ?? '—' } : null;
            })()
          : null;
      // Ocultar DMs vacíos que nunca llegaron a usarse (se crean al pulsar a una persona).
      if (c.kind === 'DIRECT' && !last) continue;
      out.push({
        id: c.id,
        kind: c.kind,
        title: c.title,
        peer,
        last: last
          ? { body: last.body, createdAt: last.createdAt.toISOString(), authorId: last.authorId }
          : null,
        unread,
      });
    }
    // General primero; luego DMs por actividad reciente.
    return out.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'CHANNEL' ? -1 : 1;
      return (b.last?.createdAt ?? '').localeCompare(a.last?.createdAt ?? '');
    });
  }

  /**
   * Total de mensajes no leídos del usuario en mensajería interna (badge del dock). SOLO lectura: no
   * crea el canal «General» ni filas de pertenencia (eso lo hace `listConversations` al abrir el dock),
   * porque este endpoint se sondea cada 60 s y no debe escribir en cada tic.
   */
  async unreadCount(user: RequestUser) {
    this.assertStaff(user);
    const memberships = await this.prisma.conversationMember.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { conversationId: true, lastReadAt: true },
    });
    let count = 0;
    for (const m of memberships) {
      count += await this.prisma.chatMessage.count({
        where: {
          tenantId: user.tenantId,
          conversationId: m.conversationId,
          authorId: { not: user.userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
    }
    return { count };
  }

  /** Mensajes de una conversación (máx. 500), con nombre de autor y adjunto resuelto. */
  async listMessages(user: RequestUser, conversationId: string) {
    await this.loadAccessible(user, conversationId);
    const messages = await this.prisma.chatMessage.findMany({
      where: { tenantId: user.tenantId, conversationId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return this.enrich(user.tenantId, messages);
  }

  /** Añade nombre de autor y nombre del documento adjunto (si lo hay) a cada mensaje. */
  private async enrich<T extends { authorId: string; attachmentDocumentId: string | null }>(
    tenantId: string,
    messages: T[],
  ) {
    const authorIds = [...new Set(messages.map((m) => m.authorId))];
    const docIds = [
      ...new Set(messages.map((m) => m.attachmentDocumentId).filter(Boolean) as string[]),
    ];
    const [authors, docs] = await Promise.all([
      authorIds.length
        ? this.prisma.user.findMany({
            where: { tenantId, id: { in: authorIds } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
      docIds.length
        ? this.prisma.document.findMany({
            where: { tenantId, id: { in: docIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const nameById = new Map(authors.map((a) => [a.id, a.fullName]));
    const docById = new Map(docs.map((d) => [d.id, d]));
    return messages.map((m) => ({
      ...m,
      author: { id: m.authorId, fullName: nameById.get(m.authorId) ?? '—' },
      attachment: m.attachmentDocumentId ? (docById.get(m.attachmentDocumentId) ?? null) : null,
    }));
  }

  /** Envía un mensaje a una conversación; emite en tiempo real y avisa a los miembros (badge + campana DM). */
  async createMessage(
    user: RequestUser,
    conversationId: string,
    body: string,
    attachmentDocumentId?: string,
  ) {
    const conv = await this.loadAccessible(user, conversationId);

    let attachmentId: string | null = null;
    if (attachmentDocumentId) {
      const doc = await this.prisma.document.findFirst({
        where: { id: attachmentDocumentId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!doc) throw new BadRequestException(apiError('checklists.documentMismatch'));
      attachmentId = doc.id;
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        tenantId: user.tenantId,
        conversationId,
        authorId: user.userId,
        body,
        attachmentDocumentId: attachmentId,
      },
    });
    const [enriched] = await this.enrich(user.tenantId, [message]);
    this.realtime.emitToConversation(conversationId, 'dm:new', enriched);

    // Avisar a los demás miembros para refrescar bandeja/badge aunque no tengan la ventana abierta.
    const members = await this.memberIds(user.tenantId, conv);
    for (const uid of members) {
      if (uid === user.userId) continue;
      this.realtime.emitToUser(uid, 'dm:inbox', { conversationId });
    }
    // Notificación durable solo en DM (en canales sería ruido). Best-effort.
    if (conv.kind === 'DIRECT') {
      const other = members.find((m) => m !== user.userId);
      if (other) {
        await this.notifications.create({
          tenantId: user.tenantId,
          userId: other,
          type: 'chat.direct',
          title: 'Nuevo mensaje directo',
          body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
          data: { conversationId },
        });
      }
    }
    return enriched;
  }

  /** IDs de miembros de una conversación. Para el canal «General», todo el staff activo del despacho. */
  private async memberIds(tenantId: string, conv: ConversationRow): Promise<string[]> {
    if (conv.kind === 'CHANNEL') {
      const staff = await this.prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          roles: { some: { role: { code: { in: STAFF_ROLES } } } },
        },
        select: { id: true },
      });
      return staff.map((s) => s.id);
    }
    return conv.members.map((m) => m.userId);
  }

  /** Alterna una reacción emoji del usuario sobre un mensaje de la conversación. */
  async react(user: RequestUser, conversationId: string, messageId: string, emoji: string) {
    await this.loadAccessible(user, conversationId);
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, tenantId: user.tenantId, conversationId },
      select: { id: true, reactions: true },
    });
    if (!message) throw new NotFoundException(apiError('messages.notFound'));

    const reactions = (message.reactions as Record<string, string[]> | null) ?? {};
    const users = new Set(reactions[emoji] ?? []);
    if (users.has(user.userId)) users.delete(user.userId);
    else users.add(user.userId);
    if (users.size > 0) reactions[emoji] = [...users];
    else delete reactions[emoji];

    await this.prisma.chatMessage.updateMany({
      where: { id: messageId, tenantId: user.tenantId },
      data: { reactions },
    });
    this.realtime.emitToConversation(conversationId, 'dm:reaction', {
      conversationId,
      messageId,
      reactions,
    });
    return { messageId, reactions };
  }

  /** Marca la conversación como leída por el usuario (ahora) y avisa para refrescar acuses y badge. */
  async markRead(user: RequestUser, conversationId: string) {
    await this.loadAccessible(user, conversationId);
    const now = new Date();
    await this.prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId: user.userId } },
      create: { tenantId: user.tenantId, conversationId, userId: user.userId, lastReadAt: now },
      update: { lastReadAt: now },
    });
    this.realtime.emitToConversation(conversationId, 'dm:read', {
      conversationId,
      userId: user.userId,
      lastReadAt: now.toISOString(),
    });
    this.realtime.emitToUser(user.userId, 'dm:inbox', { conversationId });
    return { conversationId, lastReadAt: now.toISOString() };
  }
}
