'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, refreshAccessToken, setAccessToken } from './api';
import type { AuthUser } from './auth-types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, tenantId?: string) => Promise<void>;
  logout: () => Promise<void>;
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
  useEffect(() => {
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
    setAccessToken((data as { accessToken: string }).accessToken);
    setUser(await api.get<AuthUser>('/auth/me'));
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, hasRole: (r) => user?.roles.includes(r) ?? false }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
