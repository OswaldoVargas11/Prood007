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
}

export type Role = 'FIRM_ADMIN' | 'LAWYER' | 'CLIENT';
