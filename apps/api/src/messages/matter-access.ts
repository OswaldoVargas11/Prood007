import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/**
 * Verifica que el usuario puede acceder a un expediente:
 *  - abogados/admin del despacho → cualquier expediente de su tenant;
 *  - cliente → solo los expedientes de su propia ficha de cliente.
 * Devuelve el expediente (mínimo) o lanza 404/403. Reutilizable por chat y portal.
 */
export async function assertMatterAccess(
  prisma: PrismaService,
  user: Pick<RequestUser, 'userId' | 'tenantId' | 'roles'>,
  matterId: string,
): Promise<{ id: string; clientId: string }> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, tenantId: user.tenantId },
    select: { id: true, clientId: true, client: { select: { userId: true } } },
  });
  if (!matter) throw new NotFoundException(apiError('matters.notFound'));

  const isStaff = user.roles.includes(Role.FIRM_ADMIN) || user.roles.includes(Role.LAWYER);
  if (isStaff) return { id: matter.id, clientId: matter.clientId };

  if (matter.client?.userId && matter.client.userId === user.userId) {
    return { id: matter.id, clientId: matter.clientId };
  }
  throw new ForbiddenException(apiError('matters.noAccess'));
}

/**
 * Letrados ASIGNADOS a un expediente (líder `lawyerId` + colaboradores `MatterAssignment`). Útil para
 * acotar la participación en el chat al equipo del expediente. Acotado por tenant.
 */
export async function getAssignedLawyerIds(
  prisma: PrismaService,
  tenantId: string,
  matterId: string,
): Promise<Set<string>> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, tenantId },
    select: { lawyerId: true, assignments: { select: { userId: true } } },
  });
  const ids = new Set<string>();
  if (matter?.lawyerId) ids.add(matter.lawyerId);
  for (const a of matter?.assignments ?? []) ids.add(a.userId);
  return ids;
}

/**
 * Acceso al CHAT por expediente (más estricto que `assertMatterAccess`): la participación se limita al
 * equipo asignado + el cliente.
 *  - FIRM_ADMIN: cualquier expediente del despacho (supervisión).
 *  - LAWYER: solo si está asignado (líder o colaborador) al expediente.
 *  - CLIENT: solo el expediente de su propia ficha.
 * Devuelve el expediente (mínimo) o lanza 404/403.
 */
export async function assertMatterChatAccess(
  prisma: PrismaService,
  user: Pick<RequestUser, 'userId' | 'tenantId' | 'roles'>,
  matterId: string,
): Promise<{ id: string; clientId: string }> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, tenantId: user.tenantId },
    select: {
      id: true,
      clientId: true,
      lawyerId: true,
      client: { select: { userId: true } },
      assignments: { select: { userId: true } },
    },
  });
  if (!matter) throw new NotFoundException(apiError('matters.notFound'));

  if (user.roles.includes(Role.FIRM_ADMIN)) return { id: matter.id, clientId: matter.clientId };

  if (user.roles.includes(Role.LAWYER)) {
    const assigned =
      matter.lawyerId === user.userId || matter.assignments.some((a) => a.userId === user.userId);
    if (assigned) return { id: matter.id, clientId: matter.clientId };
    throw new ForbiddenException(apiError('matters.noAccess'));
  }

  if (matter.client?.userId && matter.client.userId === user.userId) {
    return { id: matter.id, clientId: matter.clientId };
  }
  throw new ForbiddenException(apiError('matters.noAccess'));
}
