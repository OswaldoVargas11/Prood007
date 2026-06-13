/**
 * Tipos compartidos del dominio — agnósticos de jurisdicción.
 */
import type { Currency, Jurisdiction } from './enums';

/** Importe monetario. Se transporta como string decimal para evitar errores de float. */
export interface Money {
  /** Cantidad como string decimal, p. ej. "1234.56". */
  amount: string;
  currency: Currency;
}

/** Contexto del tenant resuelto por request; lo consume el núcleo y el factory de compliance. */
export interface TenantContext {
  tenantId: string;
  jurisdiction: Jurisdiction;
  currency: Currency;
  locale: string; // p. ej. "es-ES" | "es-DO"
}

/** Identidad mínima del usuario autenticado adjunta a la request. */
export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
}

/** Página genérica de resultados. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
