import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from '../../shared/api/client.ts';
import { clearAuth, getAuth, saveAuth } from '../../shared/api/auth-storage.ts';
import type { AuthUser, LoginResponse } from '../../types/auth.ts';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getAuth()?.user ?? null);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const result = await apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRetry: true,
    });

    saveAuth(result);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = getAuth()?.refreshToken;

    // Çıkışın kendisi FR-1.4 gereği her zaman "başarılı" sayılır — istek
    // başarısız olsa bile yerel oturumu temizliyoruz (bkz. access-service
    // auth.service.ts'teki aynı gerekçe).
    if (refreshToken) {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        skipAuthRetry: true,
      }).catch(() => undefined);
    }

    clearAuth();
    setUser(null);
  }, []);

  const hasPermission = useCallback((permission: string): boolean => (user?.permissions ?? []).includes(permission), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout, hasPermission }),
    [user, login, logout, hasPermission],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider dışında çağrıldı');
  return ctx;
}
