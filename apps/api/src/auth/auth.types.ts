import type { Jurisdiction } from '@legalflow/domain';

/** Payload del access token JWT. */
export interface AccessTokenPayload {
  /** subject = userId */
  sub: string;
  /** tenantId */
  tid: string;
  /** jurisdicción del tenant (para resolver el ComplianceProvider sin ir a BD) */
  jur: Jurisdiction;
  email: string;
  roles: string[];
  /** issued-at en segundos (lo añade passport-jwt al firmar; lo usamos para el corte por cambio de clave). */
  iat?: number;
}

/** Payload del refresh token JWT. */
export interface RefreshTokenPayload {
  sub: string;
  tid: string;
  /** jti = id de la fila RefreshToken (para rotación/revocación). */
  jti: string;
}

/** Usuario autenticado adjuntado a la request por la JwtStrategy. */
export interface RequestUser {
  userId: string;
  tenantId: string;
  jurisdiction: Jurisdiction;
  email: string;
  roles: string[];
  /** El usuario debe cambiar su contraseña en el próximo acceso (alta/reset por admin, SEC4). */
  mustChangePassword?: boolean;
}

/** Par de tokens devuelto al cliente. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // segundos de vida del access token
}
