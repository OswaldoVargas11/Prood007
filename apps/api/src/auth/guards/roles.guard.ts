import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@legalflow/domain';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestUser } from '../auth.types';

/** Comprueba que el usuario tenga al menos uno de los roles exigidos por @Roles(). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!user) throw new ForbiddenException('No autenticado.');

    const ok = required.some((r) => user.roles.includes(r));
    if (!ok) throw new ForbiddenException('No tienes permisos para esta acción.');
    return true;
  }
}
