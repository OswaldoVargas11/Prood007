import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { assertMatterAccess } from '../messages/matter-access';
import type { AccessTokenPayload } from '../auth/auth.types';

/**
 * Gateway de tiempo real (Socket.IO). Autentica en el handshake con el access token y une cada
 * socket a sus salas: `user:<id>` y `tenant:<id>`. Para el chat por expediente, el cliente se
 * suscribe a `matter:<id>` solo si el expediente pertenece a su tenant.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

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
      await client.join(`user:${payload.sub}`);
      await client.join(`tenant:${payload.tid}`);
    } catch {
      client.emit('error', { message: 'No autenticado.' });
      client.disconnect(true);
    }
  }

  /**
   * Suscripción a la sala de un expediente. Aplica el MISMO control que el chat por HTTP
   * (`assertMatterAccess`): staff → cualquier expediente de su tenant; CLIENTE → solo los suyos.
   * Antes solo comprobaba el tenant, lo que permitía a un cliente escuchar el chat de otro cliente
   * del mismo despacho (IDOR horizontal). Acotado por tenant (RLS) vía `runWithTenant`.
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
        assertMatterAccess(this.prisma, { userId, tenantId, roles }, data.matterId),
      );
    } catch {
      return { ok: false };
    }
    await client.join(`matter:${data.matterId}`);
    return { ok: true };
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToMatter(matterId: string, event: string, payload: unknown): void {
    this.server?.to(`matter:${matterId}`).emit(event, payload);
  }
}
