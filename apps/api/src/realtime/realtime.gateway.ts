import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { assertMatterChatAccess } from '../messages/matter-access';
import type { AccessTokenPayload } from '../auth/auth.types';

/**
 * Gateway de tiempo real (Socket.IO). Autentica en el handshake con el access token y une cada socket
 * a sus salas `user:<id>` y `tenant:<id>`. Para el chat por expediente: el socket se suscribe a
 * `matter:<id>` solo si participa (equipo asignado + cliente), y se publican presencia y «escribiendo…».
 *
 * MULTI-INSTANCIA: si `REDIS_URL` está definido, se activa el adaptador Redis de Socket.IO para que
 * las salas, los broadcasts y la presencia se compartan entre procesos (varias máquinas en Fly). Sin
 * `REDIS_URL` (p. ej. una sola instancia) funciona con el adaptador en memoria por defecto. La presencia
 * se calcula con `fetchSockets()` (consciente del adaptador), por lo que es correcta en ambos casos. El
 * «leído» NO es efímero: se persiste en MatterReadState vía HTTP (MessagesService.markRead).
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Activa el adaptador Redis si hay `REDIS_URL` (presencia/broadcast entre instancias). */
  afterInit(server: Server): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.log('REDIS_URL no definido: tiempo real en memoria (una instancia).');
      return;
    }
    try {
      const pub = new Redis(url);
      const sub = pub.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.logger.log('Adaptador Redis de Socket.IO activado (tiempo real multi-instancia).');
    } catch (err) {
      this.logger.error(`No se pudo activar el adaptador Redis: ${String(err)}`);
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      if (!token) throw new Error('sin token');
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      });
      client.data.userId = payload.sub;
      client.data.tenantId = payload.tid;
      client.data.roles = payload.roles ?? [];
      client.data.matters = new Set<string>();
      client.data.conversations = new Set<string>();
      await client.join(`user:${payload.sub}`);
      await client.join(`tenant:${payload.tid}`);
      // Presencia a nivel de despacho (para el directorio del chat social): el staff recién conectado.
      void this.emitTenantPresence(payload.tid);
    } catch {
      client.emit('error', { message: 'No autenticado.' });
      client.disconnect(true);
    }
  }

  /** Al desconectar (salas ya liberadas), recalcula la presencia de expedientes y del despacho. */
  handleDisconnect(client: Socket): void {
    const matters = client.data.matters as Set<string> | undefined;
    if (matters) for (const matterId of matters) void this.emitPresence(matterId);
    const tenantId = client.data.tenantId as string | undefined;
    if (tenantId) void this.emitTenantPresence(tenantId);
  }

  /**
   * Suscripción a la sala de un expediente. Aplica el control del chat (`assertMatterChatAccess`):
   * staff asignado o admin del despacho; cliente solo el suyo. Acotado por tenant (RLS) vía runWithTenant.
   */
  @SubscribeMessage('matter:subscribe')
  async subscribeMatter(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matterId: string },
  ): Promise<{ ok: boolean }> {
    const tenantId = client.data.tenantId as string | undefined;
    const userId = client.data.userId as string | undefined;
    const roles = (client.data.roles as string[] | undefined) ?? [];
    if (!tenantId || !userId || !data?.matterId) return { ok: false };
    try {
      await runWithTenant(tenantId, () =>
        assertMatterChatAccess(this.prisma, { userId, tenantId, roles }, data.matterId),
      );
    } catch {
      return { ok: false };
    }
    await client.join(`matter:${data.matterId}`);
    (client.data.matters as Set<string>).add(data.matterId);
    await this.emitPresence(data.matterId);
    return { ok: true };
  }

  /** Salir de la sala (al cerrar el chat en el cliente). */
  @SubscribeMessage('matter:unsubscribe')
  async unsubscribeMatter(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matterId: string },
  ): Promise<{ ok: boolean }> {
    if (!data?.matterId) return { ok: false };
    await client.leave(`matter:${data.matterId}`);
    (client.data.matters as Set<string> | undefined)?.delete(data.matterId);
    await this.emitPresence(data.matterId);
    return { ok: true };
  }

  /** «Escribiendo…»: se reenvía al resto de la sala (no al emisor). Efímero. */
  @SubscribeMessage('matter:typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matterId: string; isTyping: boolean },
  ): void {
    const userId = client.data.userId as string | undefined;
    const matters = client.data.matters as Set<string> | undefined;
    if (!userId || !data?.matterId || !matters?.has(data.matterId)) return;
    client.to(`matter:${data.matterId}`).emit('typing:update', {
      matterId: data.matterId,
      userId,
      isTyping: Boolean(data.isTyping),
    });
  }

  /**
   * Presencia de un expediente: usuarios únicos con algún socket en la sala. Usa `fetchSockets()`, que
   * el adaptador resuelve a TODAS las instancias cuando Redis está activo (en memoria, solo la local).
   */
  private async emitPresence(matterId: string): Promise<void> {
    if (!this.server) return;
    try {
      const sockets = await this.server.in(`matter:${matterId}`).fetchSockets();
      const online = [...new Set(sockets.map((s) => s.data.userId as string).filter(Boolean))];
      this.server.to(`matter:${matterId}`).emit('presence:update', { matterId, online });
    } catch {
      /* presencia best-effort */
    }
  }

  // ── Mensajería interna (chat social): conversaciones, presencia de despacho y «escribiendo…» ──

  /** El cliente pide la presencia actual del despacho (al montar el dock). Respuesta solo a ese socket. */
  @SubscribeMessage('presence:request')
  async presenceRequest(@ConnectedSocket() client: Socket): Promise<void> {
    const tenantId = client.data.tenantId as string | undefined;
    if (!tenantId || !this.server) return;
    const online = await this.tenantOnline(tenantId);
    client.emit('presence:tenant', { online });
  }

  /**
   * Suscripción a la sala de una conversación (DM o canal). Verifica el acceso por tenant (RLS):
   * canal → cualquier staff del despacho; DM → solo los dos participantes.
   */
  @SubscribeMessage('conversation:subscribe')
  async subscribeConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<{ ok: boolean }> {
    const tenantId = client.data.tenantId as string | undefined;
    const userId = client.data.userId as string | undefined;
    const roles = (client.data.roles as string[] | undefined) ?? [];
    if (!tenantId || !userId || !data?.conversationId) return { ok: false };
    const ok = await runWithTenant(tenantId, () =>
      this.canAccessConversation(tenantId, userId, roles, data.conversationId),
    ).catch(() => false);
    if (!ok) return { ok: false };
    await client.join(`conversation:${data.conversationId}`);
    (client.data.conversations as Set<string>).add(data.conversationId);
    return { ok: true };
  }

  @SubscribeMessage('conversation:unsubscribe')
  async unsubscribeConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<{ ok: boolean }> {
    if (!data?.conversationId) return { ok: false };
    await client.leave(`conversation:${data.conversationId}`);
    (client.data.conversations as Set<string> | undefined)?.delete(data.conversationId);
    return { ok: true };
  }

  /** «Escribiendo…» en una conversación: se reenvía al resto de la sala (no al emisor). Efímero. */
  @SubscribeMessage('conversation:typing')
  conversationTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ): void {
    const userId = client.data.userId as string | undefined;
    const subs = client.data.conversations as Set<string> | undefined;
    if (!userId || !data?.conversationId || !subs?.has(data.conversationId)) return;
    client.to(`conversation:${data.conversationId}`).emit('dm:typing', {
      conversationId: data.conversationId,
      userId,
      isTyping: Boolean(data.isTyping),
    });
  }

  /** ¿Puede el usuario acceder a la conversación? Canal: cualquier staff del tenant; DM: ser miembro. */
  private async canAccessConversation(
    tenantId: string,
    userId: string,
    roles: string[],
    conversationId: string,
  ): Promise<boolean> {
    const isStaff = roles.includes('FIRM_ADMIN') || roles.includes('LAWYER');
    if (!isStaff) return false;
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { kind: true, members: { select: { userId: true } } },
    });
    if (!conv) return false;
    if (conv.kind === 'CHANNEL') return true;
    return conv.members.some((m) => m.userId === userId);
  }

  /** IDs de usuarios del despacho con algún socket conectado (presencia de despacho). */
  private async tenantOnline(tenantId: string): Promise<string[]> {
    if (!this.server) return [];
    try {
      const sockets = await this.server.in(`tenant:${tenantId}`).fetchSockets();
      return [...new Set(sockets.map((s) => s.data.userId as string).filter(Boolean))];
    } catch {
      return [];
    }
  }

  /** Difunde la presencia del despacho a todos sus sockets (directorio del chat social). */
  private async emitTenantPresence(tenantId: string): Promise<void> {
    if (!this.server) return;
    const online = await this.tenantOnline(tenantId);
    this.server.to(`tenant:${tenantId}`).emit('presence:tenant', { online });
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToMatter(matterId: string, event: string, payload: unknown): void {
    this.server?.to(`matter:${matterId}`).emit(event, payload);
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit(event, payload);
  }
}
