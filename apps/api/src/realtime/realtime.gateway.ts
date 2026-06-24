import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { assertMatterChatAccess } from '../messages/matter-access';
import type { AccessTokenPayload } from '../auth/auth.types';

/**
 * Gateway de tiempo real (Socket.IO). Autentica en el handshake con el access token y une cada socket
 * a sus salas `user:<id>` y `tenant:<id>`. Para el chat por expediente: el socket se suscribe a
 * `matter:<id>` solo si participa (equipo asignado + cliente), y se publican presencia y «escribiendo…».
 *
 * Presencia y typing son EFÍMEROS y viven en memoria del proceso. En multi-instancia (varias máquinas
 * en Fly) habría que añadir el adaptador Redis de Socket.IO (`@socket.io/redis-adapter`) para compartir
 * salas y presencia entre procesos; el resto del código (eventos, gating) no cambia. Lo «leído» NO es
 * efímero: se persiste en MatterReadState vía HTTP (MessagesService.markRead).
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  // Presencia en memoria: matterId → (userId → nº de sockets de ese usuario en la sala).
  private readonly presence = new Map<string, Map<string, number>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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
      await client.join(`user:${payload.sub}`);
      await client.join(`tenant:${payload.tid}`);
    } catch {
      client.emit('error', { message: 'No autenticado.' });
      client.disconnect(true);
    }
  }

  /** Al desconectar, abandona todas las salas de expediente para recalcular presencia. */
  handleDisconnect(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    const matters = client.data.matters as Set<string> | undefined;
    if (!userId || !matters) return;
    for (const matterId of matters) this.leaveMatter(matterId, userId);
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
    this.joinMatter(data.matterId, userId);
    return { ok: true };
  }

  /** Salir de la sala (al cerrar el chat en el cliente). */
  @SubscribeMessage('matter:unsubscribe')
  async unsubscribeMatter(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matterId: string },
  ): Promise<{ ok: boolean }> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.matterId) return { ok: false };
    await client.leave(`matter:${data.matterId}`);
    (client.data.matters as Set<string>)?.delete(data.matterId);
    this.leaveMatter(data.matterId, userId);
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

  // ── Presencia (en memoria) ────────────────────────────────────────────────

  private joinMatter(matterId: string, userId: string): void {
    let users = this.presence.get(matterId);
    if (!users) {
      users = new Map();
      this.presence.set(matterId, users);
    }
    users.set(userId, (users.get(userId) ?? 0) + 1);
    this.emitPresence(matterId);
  }

  private leaveMatter(matterId: string, userId: string): void {
    const users = this.presence.get(matterId);
    if (!users) return;
    const n = (users.get(userId) ?? 0) - 1;
    if (n <= 0) users.delete(userId);
    else users.set(userId, n);
    if (users.size === 0) this.presence.delete(matterId);
    this.emitPresence(matterId);
  }

  private emitPresence(matterId: string): void {
    const online = [...(this.presence.get(matterId)?.keys() ?? [])];
    this.server?.to(`matter:${matterId}`).emit('presence:update', { matterId, online });
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToMatter(matterId: string, event: string, payload: unknown): void {
    this.server?.to(`matter:${matterId}`).emit(event, payload);
  }
}
