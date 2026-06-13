import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { assertMatterAccess } from './matter-access';
import type { RequestUser } from '../auth/auth.types';

/** Chat por expediente. Acceso restringido a staff del despacho y al cliente del expediente. */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(user: RequestUser, matterId: string, body: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    const message = await this.prisma.message.create({
      data: { tenantId: user.tenantId, matterId, authorId: user.userId, body },
      include: { author: { select: { id: true, fullName: true } } },
    });
    this.realtime.emitToMatter(matterId, 'message:new', message);
    return message;
  }

  async list(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.prisma.message.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, fullName: true } } },
      take: 500,
    });
  }
}
