import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import { CreateClauseDto } from './dto/create-clause.dto';

/** Cláusulas reutilizables compartidas por el despacho. Acotadas al tenant por RLS. */
@Injectable()
export class ClausesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.clause.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, body: true },
    });
  }

  create(user: RequestUser, dto: CreateClauseDto) {
    return this.prisma.clause.create({
      data: { tenantId: user.tenantId, name: dto.name.trim(), body: dto.body },
      select: { id: true, name: true, body: true },
    });
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.clause.deleteMany({ where: { id, tenantId: user.tenantId } });
    if (res.count === 0) throw new NotFoundException({ messageKey: 'clauses.notFound' });
    return { success: true };
  }
}
