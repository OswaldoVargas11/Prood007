'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, refreshAccessToken, setAccessToken } from './api';
import type { AuthUser } from './auth-types';

/** Datos de alta de despacho (onboarding). El backend siembra RBAC y crea el primer FIRM_ADMIN. */
export interface RegisterTenantInput {
  tenantName: string;
  jurisdiction: 'es' | 'do';
  currency: 'EUR' | 'DOP';
  taxId?: string;
  /** Domicilio fiscal del despacho (opcional en el alta; encabeza facturas e identifica la parte del DPA). */
  fiscalAddress?: string;
  /** Aceptación clickwrap de ToS + Privacidad + DPA en el alta (casilla afirmativa obligatoria en la UI). */
  acceptLegal?: boolean;
  admin: { fullName: string; email: string; password: string };
}

/** Si el usuario tiene MFA, `login` devuelve este desafío en vez de iniciar sesión. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** Devuelve un `MfaChallenge` si el usuario tiene 2FA; si no, inicia sesión y devuelve undefined. */
  login: (email: string, password: string, tenantId?: string) => Promise<MfaChallenge | undefined>;
  /** Segundo paso del login con MFA: completa la sesión con el token de desafío + el código. */
  mfaLogin: (mfaToken: string, code: string) => Promise<void>;
  /** Canjea el ticket del login social por una sesión (o devuelve un desafío MFA). */
  socialFinish: (ticket: string) => Promise<MfaChallenge | undefined>;
  register: (input: RegisterTenantInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Recarga el usuario desde /auth/me (p. ej. tras un cambio de contraseña forzado). */
  refreshUser: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(data: unknown, fallback: string): string {
  const raw = (data as { message?: string | string[] } | undefined)?.message;
  if (Array.isArray(raw)) return raw.join(', ');
  return raw ?? fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Al montar: intenta mintar un access desde la cookie de refresh (BFF) y cargar /me.
  //
  // En rutas públicas (login, onboarding) no hay sesión que restaurar, así que NO disparamos el
  // bootstrap: evita el ruidoso `401 /api/auth/refresh` en esas páginas. Esto NO toca el refresh
  // autenticado normal (el reintento on-401 de `api.ts`, la rotación ni la detección de reuso del
  // BFF): un usuario con sesión sigue restaurándola y refrescando exactamente igual que antes.
  useEffect(() => {
    const isPublicPath = /\/(login|onboarding)(\/|$)/.test(window.location.pathname);
    if (isPublicPath) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const ok = await refreshAccessToken();
      if (ok) {
        try {
          const me = await api.get<AuthUser>('/auth/me');
          if (active) setUser(me);
        } catch {
          if (active) setUser(null);
        }
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, tenantId?: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantId: tenantId || undefined }),
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok)
      throw new ApiError(res.status, errorMessage(data, 'No se pudo iniciar sesión'), data);
    if (data && (data as MfaChallenge).mfaRequired) {
      return data as MfaChallenge;
    }
    setAccessToken((data as { accessToken: string }).accessToken);
    setUser(await api.get<AuthUser>('/auth/me'));
  }, []);

  const mfaLogin = useCallback(async (mfaToken: string, code: string) => {
    const res = await fetch('/api/auth/mfa/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken, code }),
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok)
      throw new ApiError(res.status, errorMessage(data, 'No se pudo verificar el código'), data);
    setAccessToken((data as { accessToken: string }).accessToken);
    setUser(await api.get<AuthUser>('/auth/me'));
  }, []);

  const socialFinish = useCallback(async (ticket: string) => {
    const res = await fetch('/api/auth/social/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok)
      throw new ApiError(res.status, errorMessage(data, 'No se pudo iniciar sesión'), data);
    if (data && (data as MfaChallenge).mfaRequired) {
      return data as MfaChallenge;
    }
    setAccessToken((data as { accessToken: string }).accessToken);
    setUser(await api.get<AuthUser>('/auth/me'));
  }, []);

  const register = useCallback(async (input: RegisterTenantInput) => {
    const res = await fetch('/api/auth/register-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok)
      throw new ApiError(res.status, errorMessage(data, 'No se pudo crear el despacho'), data);
    setAccessToken((data as { accessToken: string }).accessToken);
    setUser(await api.get<AuthUser>('/auth/me'));
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await api.get<AuthUser>('/auth/me'));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      mfaLogin,
      socialFinish,
      register,
      logout,
      refreshUser,
      hasRole: (r) => user?.roles.includes(r) ?? false,
    }),
    [user, loading, login, mfaLogin, socialFinish, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
