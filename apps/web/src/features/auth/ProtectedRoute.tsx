import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.tsx';

interface ProtectedRouteProps {
  /** Verilmezse yalnızca giriş yapılmış olması yeterli. */
  permission?: string;
  children: ReactNode;
}

/**
 * FR-5.2: yetkisi olmayan ekranın route'una doğrudan gidilirse 403 sayfası
 * çıkar. Bu kontrol yalnızca UX'tir — gerçek koruma her zaman backend'de
 * (`requirePermission`); burada gizlense bile API çağrısı 403 döner.
 */
export function ProtectedRoute({ permission, children }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/403" replace />;
  }

  return children;
}
