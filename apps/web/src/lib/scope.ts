/**
 * Ámbito de navegación derivado de los roles del access token, para el gate de rutas en el
 * middleware de SERVIDOR (no dependiente de JS de cliente). Ver D-014/D-015.
 *
 * - `firm`   → staff del despacho (FIRM_ADMIN | LAWYER): accede a la app del despacho.
 * - `client` → solo rol CLIENT: accede únicamente al portal.
 *
 * El backend sigue siendo la verdad (RBAC `@Roles` + RLS). Esto solo evita que un CLIENT pueda
 * siquiera cargar las rutas de la firm app (aunque desactive JS). La decodificación del JWT aquí es
 * solo para enrutar (el token viene firmado por nuestro backend); NO sustituye la verificación.
 */
export type Scope = 'firm' | 'client';

const STAFF_ROLES = ['FIRM_ADMIN', 'LAWYER'];

export function scopeFromRoles(roles: string[]): Scope {
  return roles.some((r) => STAFF_ROLES.includes(r)) ? 'firm' : 'client';
}

/** Decodifica el payload del JWT (sin verificar firma) y deriva el ámbito. Ante duda, `client`. */
export function scopeFromAccessToken(accessToken: string): Scope {
  try {
    const part = accessToken.split('.')[1];
    if (!part) return 'client';
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as {
      roles?: string[];
    };
    return scopeFromRoles(payload.roles ?? []);
  } catch {
    return 'client';
  }
}

/** Jurisdicción del despacho (gobierna terminología fiscal: ITBIS↔IVA, etc.). Ante duda, `es`. */
export type AppJurisdiction = 'es' | 'do';
export function jurisdictionFromAccessToken(accessToken: string): AppJurisdiction {
  try {
    const part = accessToken.split('.')[1];
    if (!part) return 'es';
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { jur?: string };
    return payload.jur === 'do' ? 'do' : 'es';
  } catch {
    return 'es';
  }
}
