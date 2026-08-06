import type { ComponentType } from 'react';
import { FiClipboard, FiLogOut, FiZap } from 'react-icons/fi';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../features/auth/useAuth.tsx';
import styles from './AppShell.module.scss';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/outages', label: 'Kesintiler', icon: FiZap, permission: 'outage:read' },
  { to: '/work-orders', label: 'İş Emirleri', icon: FiClipboard, permission: 'workorder:read' },
];

/**
 * FR-5.2: yetkisi olmayan ekranın menü öğesi gösterilmez. Bu yalnızca UX —
 * asıl koruma ProtectedRoute + backend'in requirePermission'ı.
 */
export function AppShell() {
  const { user, hasPermission, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>E</div>

        <nav className={styles.nav}>
          {NAV_ITEMS.filter((item) => hasPermission(item.permission)).map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => clsx(styles.navItem, isActive && styles.navItemActive)}>
              <item.icon />
              <span className={styles.navItem__label}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button type="button" onClick={handleLogout} className={clsx(styles.navItem, styles.navItemButton)}>
          <FiLogOut />
          <span className={styles.navItem__label}>Çıkış yap</span>
        </button>
      </aside>

      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.headerUser}>
            <span className={styles.headerUserName}>{user?.fullName}</span>
            <span> · </span>
            {user?.roles.join(', ')}
          </div>
        </header>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
