import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { apiError } from '../common/api-messages';
import { extractTokens } from './render';
import type { RequestUser } from '../auth/auth.types';

/**
 * Gestión de plantillas de documento del despacho (contratos/escritos con campos combinados).
 * SIEMPRE acotada por tenant (filtro `tenantId` + RLS). Solo staff (controlado en el controller).
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser) {
    const templates = await this.prisma.documentTemplate.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    return templates.map((t) => ({ ...t, tokens: extractTokens(t.body) }));
  }

  async get(user: RequestUser, id: string) {
    const tpl = await this.prisma.documentTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!tpl) throw new NotFoundException(apiError('templates.notFound'));
    return { ...tpl, tokens: extractTokens(tpl.body) };
  }

  async create(user: RequestUser, dto: CreateTemplateDto) {
    const created = await this.prisma.documentTemplate.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        body: dto.body,
      },
    });
    await this.audit.log(user, 'template.created', 'DocumentTemplate', created.id, {
      name: created.name,
    });
    return created;
  }

  async update(user: RequestUser, id: string, dto: UpdateTemplateDto) {
    await this.get(user, id); // valida pertenencia al tenant
    const updated = await this.prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
    });
    await this.audit.log(user, 'template.updated', 'DocumentTemplate', id);
    return updated;
  }

  async remove(user: RequestUser, id: string) {
    await this.get(user, id);
    await this.prisma.documentTemplate.deleteMany({ where: { id, tenantId: user.tenantId } });
    await this.audit.log(user, 'template.deleted', 'DocumentTemplate', id);
    return { success: true as const };
  }
}
