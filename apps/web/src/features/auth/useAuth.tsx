import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from '../../shared/api/client.ts';
import type { AuthUser, LoginResponse } from '../../types/auth.ts';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Sayfa yüklenişinde `/api/auth/me` ile oturum durumu doğrulanana kadar `true`. */
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Çerezler JS'e görünmez; oturum durumu sunucuya sorularak öğrenilir.
  useEffect(() => {
    let cancelled = false;

    apiFetch<AuthUser>('/api/auth/me', { redirectOnAuthFailure: false })
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const result = await apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRetry: true,
    });

    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // Çıkış işleminde API çağrısı başarısız olsa bile yerel oturumu temizler.
    await apiFetch('/api/auth/logout', { method: 'POST', skipAuthRetry: true }).catch(() => undefined);
    setUser(null);
  }, []);

  const hasPermission = useCallback((permission: string): boolean => (user?.permissions ?? []).includes(permission), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isInitializing, login, logout, hasPermission }),
    [user, isInitializing, login, logout, hasPermission],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider dışında çağrıldı');
  return ctx;
}
