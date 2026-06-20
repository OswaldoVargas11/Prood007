/** Tipos del dominio de auth, alineados con el contrato del backend (apps/api). */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** Respuesta de `GET /api/auth/me` (el cliente NO maneja tenantId para filtrar; es informativo). */
export interface AuthUser {
  userId: string;
  tenantId: string;
  jurisdiction: 'es' | 'do';
  email: string;
  roles: string[];
  /** Si true, el backend exige cambiar la contraseña antes de operar (cuenta creada por admin/reset). */
  mustChangePassword?: boolean;
  /** Si false, el email no está confirmado: el front bloquea hasta verificar (anti-bots). */
  emailVerified?: boolean;
  /** Despacho del usuario: nombre (header), id (soporte de login) y moneda base (informes). */
  tenant?: { id: string; name: string; currency: string };
}

export type Role = 'FIRM_ADMIN' | 'LAWYER' | 'CLIENT';
