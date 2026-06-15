import { Role } from '@legalflow/domain';

/**
 * Catálogo de permisos (global, agnóstico de jurisdicción) y su asignación a roles base.
 * El RolesGuard del MVP resuelve por ROL, pero persistimos el grafo rol↔permiso para granularidad
 * futura sin migración de datos.
 */
export const PERMISSIONS = [
  'tenant:manage',
  'user:manage',
  'client:read',
  'client:write',
  'matter:read',
  'matter:write',
  'document:read',
  'document:write',
  'document:approve',
  'task:read',
  'task:write',
  'invoice:read',
  'invoice:write',
  'ledger:read',
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

/** Nombre legible por código de permiso (clave para i18n futura). */
export const PERMISSION_NAMES: Record<PermissionCode, string> = {
  'tenant:manage': 'Gestionar el despacho',
  'user:manage': 'Gestionar usuarios',
  'client:read': 'Ver clientes',
  'client:write': 'Editar clientes',
  'matter:read': 'Ver expedientes',
  'matter:write': 'Editar expedientes',
  'document:read': 'Ver documentos',
  'document:write': 'Editar documentos',
  'document:approve': 'Aprobar/rechazar documentos',
  'task:read': 'Ver tareas',
  'task:write': 'Editar tareas',
  'invoice:read': 'Ver facturas',
  'invoice:write': 'Emitir facturas',
  'ledger:read': 'Ver el ledger',
};

/** Asignación de permisos por rol base. */
export const ROLE_PERMISSIONS: Record<Role, PermissionCode[]> = {
  [Role.FIRM_ADMIN]: [...PERMISSIONS],
  [Role.LAWYER]: [
    'client:read',
    'client:write',
    'matter:read',
    'matter:write',
    'document:read',
    'document:write',
    'document:approve',
    'task:read',
    'task:write',
    'invoice:read',
    'invoice:write',
    'ledger:read',
  ],
  [Role.CLIENT]: ['matter:read', 'document:read', 'invoice:read', 'ledger:read'],
};

/** Nombre legible por rol. */
export const ROLE_NAMES: Record<Role, string> = {
  [Role.FIRM_ADMIN]: 'Administrador del despacho',
  [Role.LAWYER]: 'Abogado',
  [Role.CLIENT]: 'Cliente',
};
