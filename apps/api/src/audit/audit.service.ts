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
      this.logger.error(`No se pudo registrar auditoría ${action} ${entityType}:${entityId}`, err as Error);
    }
  }
}
