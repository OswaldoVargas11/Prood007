import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';

/**
 * Registro de auditoría inmutable (append-only). Toda acción sensible debe pasar por aquí.
 * El modelo no expone update/delete; el endurecimiento adicional (trigger/RLS) se documenta en
 * DECISIONS. Nunca registra secretos.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    actor: { tenantId: string; userId?: string } | RequestUser,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, unknown>,
    ip?: string,
  ): Promise<void> {
    const actorId = 'userId' in actor ? actor.userId : undefined;
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId,
          action,
          entityType,
          entityId,
          metadata: metadata ? (metadata as object) : undefined,
          ip,
        },
      });
    } catch (err) {
      // La auditoría no debe romper la operación de negocio, pero sí dejar traza del fallo.
      this.logger.error(
        `No se pudo registrar auditoría ${action} ${entityType}:${entityId}`,
        err as Error,
      );
    }
  }

  /** Listado paginado del registro de auditoría del tenant, con el nombre del actor. Solo FIRM_ADMIN. */
  async listForTenant(
    actor: { tenantId: string },
    page = 1,
    pageSize = 50,
  ): Promise<{
    items: {
      id: string;
      actorId: string | null;
      actorName: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata: unknown;
      createdAt: Date;
    }[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const skip = (page - 1) * pageSize;
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where: { tenantId: actor.tenantId } }),
    ]);

    const actorIds = [
      ...new Set(logs.map((l) => l.actorId).filter((x): x is string => Boolean(x))),
    ];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds }, tenantId: actor.tenantId },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      items: logs.map((l) => ({
        id: l.id,
        actorId: l.actorId,
        actorName: l.actorId ? (nameById.get(l.actorId) ?? 'Usuario eliminado') : 'Sistema',
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: l.metadata,
        createdAt: l.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
}
