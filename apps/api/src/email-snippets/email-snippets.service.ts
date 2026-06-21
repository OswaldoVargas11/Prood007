import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import { CreateEmailSnippetDto } from './dto/create-email-snippet.dto';

/** Plantillas de correo compartidas por el despacho. Acotadas al tenant por RLS. */
@Injectable()
export class EmailSnippetsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.emailSnippet.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, subject: true, body: true },
    });
  }

  create(user: RequestUser, dto: CreateEmailSnippetDto) {
    return this.prisma.emailSnippet.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        subject: dto.subject?.trim() || null,
        body: dto.body,
      },
      select: { id: true, name: true, subject: true, body: true },
    });
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.emailSnippet.deleteMany({
      where: { id, tenantId: user.tenantId },
    });
    if (res.count === 0) throw new NotFoundException({ messageKey: 'emailSnippets.notFound' });
    return { success: true };
  }
}
