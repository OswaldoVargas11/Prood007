import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import { CreateSavedViewDto, type SavedViewScope } from './dto/create-saved-view.dto';

/** Vistas guardadas (presets de filtros) privadas por usuario y ámbito. Acotadas al tenant por RLS. */
@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: RequestUser, scope: SavedViewScope) {
    return this.prisma.savedView.findMany({
      where: { tenantId: user.tenantId, userId: user.userId, scope },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, scope: true, filters: true, createdAt: true },
    });
  }

  create(user: RequestUser, dto: CreateSavedViewDto) {
    return this.prisma.savedView.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        scope: dto.scope,
        name: dto.name.trim(),
        filters: dto.filters as object,
      },
      select: { id: true, name: true, scope: true, filters: true, createdAt: true },
    });
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.savedView.deleteMany({
      where: { id, tenantId: user.tenantId, userId: user.userId },
    });
    if (res.count === 0) throw new NotFoundException({ messageKey: 'savedViews.notFound' });
    return { success: true };
  }
}
