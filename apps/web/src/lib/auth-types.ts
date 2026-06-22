/** Tipos del dominio de auth, alineados con el contrato del backend (apps/api). */

/** Funciones con gating por tier (alineado con `Feature` de @legalflow/domain). */
export type Feature =
  | 'templates'
  | 'clauses'
  | 'document-packages'
  | 'signatures'
  | 'closing'
  | 'data-room'
  | 'engagement'
  | 'company-secretary'
  | 'ai'
  | 'integrations'
  | 'cloud-import'
  | 'addins'
  | 'semantic-search';

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
  /** Despacho del usuario: nombre (header), id, moneda, plan/tier y entitlements por función. */
  tenant?: {
    id: string;
    name: string;
    currency: string;
    plan?: string;
    subscriptionStatus?: string;
    /** Función→disponible según el tier del plan. Ausente ⇒ trátalo como disponible. */
    entitlements?: Partial<Record<Feature, boolean>>;
  };
}

export type Role = 'FIRM_ADMIN' | 'LAWYER' | 'CLIENT';
