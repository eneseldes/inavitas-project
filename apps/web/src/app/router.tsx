import { Navigate, Route, Routes } from 'react-router-dom';
import { ForbiddenPage } from '../features/auth/ForbiddenPage.tsx';
import { LoginPage } from '../features/auth/LoginPage.tsx';
import { ProtectedRoute } from '../features/auth/ProtectedRoute.tsx';
import { useAuth } from '../features/auth/useAuth.tsx';
import { OutageGrid } from '../features/outages/OutageGrid.tsx';
import { UserManagementPage } from '../features/user-management/UserManagementPage.tsx';
import { WorkOrderGrid } from '../features/work-orders/WorkOrderGrid.tsx';
import { AppShell } from '../shared/components/AppShell.tsx';

/** Kullanıcının yetkisine göre erişebildiği ilk ekrana yönlendirir. */
function RootRedirect() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  if (permissions.includes('outage:read')) return <Navigate to="/outages" replace />;
  if (permissions.includes('workorder:read')) return <Navigate to="/work-orders" replace />;
  return <Navigate to="/403" replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<RootRedirect />} />
        <Route
          path="outages"
          element={
            <ProtectedRoute permission="outage:read">
              <OutageGrid />
            </ProtectedRoute>
          }
        />
        <Route
          path="work-orders"
          element={
            <ProtectedRoute permission="workorder:read">
              <WorkOrderGrid />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute permission="user:manage">
              <UserManagementPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
