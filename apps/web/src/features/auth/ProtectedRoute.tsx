import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.tsx';

interface ProtectedRouteProps {
  /** Verilmezse yalnızca giriş yapılmış olması yeterli. */
  permission?: string;
  children: ReactNode;
}

/**
 * Kullanıcının oturum ve sayfa yetkisini kontrol eder.
 * Yetkisiz erişim durumunda giriş sayfasına veya 403 sayfasına yönlendirir.
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
