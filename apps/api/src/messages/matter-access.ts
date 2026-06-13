import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';

/**
 * Verifica que el usuario puede acceder a un expediente:
 *  - abogados/admin del despacho → cualquier expediente de su tenant;
 *  - cliente → solo los expedientes de su propia ficha de cliente.
 * Devuelve el expediente (mínimo) o lanza 404/403. Reutilizable por chat y portal.
 */
export async function assertMatterAccess(
  prisma: PrismaService,
  user: RequestUser,
  matterId: string,
): Promise<{ id: string; clientId: string }> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, tenantId: user.tenantId },
    select: { id: true, clientId: true, client: { select: { userId: true } } },
  });
  if (!matter) throw new NotFoundException('Expediente no encontrado.');

  const isStaff = user.roles.includes(Role.FIRM_ADMIN) || user.roles.includes(Role.LAWYER);
  if (isStaff) return { id: matter.id, clientId: matter.clientId };

  if (matter.client?.userId && matter.client.userId === user.userId) {
    return { id: matter.id, clientId: matter.clientId };
  }
  throw new ForbiddenException('No tienes acceso a este expediente.');
}
