import { SetMetadata } from '@nestjs/common';
import type { Role } from '@legalflow/domain';

export const ROLES_KEY = 'roles';

/** Restringe una ruta a uno o varios roles. Se evalúa en RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
