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
      });
      client.data.userId = payload.sub;
      client.data.tenantId = payload.tid;
      await client.join(`user:${payload.sub}`);
      await client.join(`tenant:${payload.tid}`);
    } catch {
      client.emit('error', { message: 'No autenticado.' });
      client.disconnect(true);
    }
  }

  /** Suscripción a la sala de un expediente (verifica pertenencia al tenant). */
  @SubscribeMessage('matter:subscribe')
  async subscribeMatter(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matterId: string },
  ): Promise<{ ok: boolean }> {
    const tenantId = client.data.tenantId as string | undefined;
    if (!tenantId || !data?.matterId) return { ok: false };
    const matter = await this.prisma.matter.findFirst({
      where: { id: data.matterId, tenantId },
      select: { id: true },
    });
    if (!matter) return { ok: false };
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
