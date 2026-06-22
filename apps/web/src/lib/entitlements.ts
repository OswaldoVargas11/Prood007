'use client';

import { useAuth } from '@/lib/auth';
import type { Feature } from '@/lib/auth-types';

/**
 * ¿El plan del despacho incluye esta función? Lee los entitlements de `/auth/me` (contexto de auth).
 * Por defecto PERMISIVO: si aún no hay usuario/entitlements cargados o la clave no viene, devuelve true
 * (evita parpadeos de "bloqueado" mientras carga; el backend es la fuente de verdad y rechaza con 403).
 */
export function useEntitlement(feature: Feature): boolean {
  const { user } = useAuth();
  const ent = user?.tenant?.entitlements;
  if (!ent || ent[feature] === undefined) return true;
  return ent[feature] === true;
}
