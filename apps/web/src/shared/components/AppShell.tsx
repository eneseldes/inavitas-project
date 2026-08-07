import { useState, type ComponentType } from 'react';
import { FiChevronLeft, FiChevronRight, FiFileText, FiLogOut, FiZap } from 'react-icons/fi';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../features/auth/useAuth.tsx';
import { formatRoles } from '../labels.ts';
import styles from './AppShell.module.scss';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/outages', label: 'Kesintiler', icon: FiZap, permission: 'outage:read' },
  { to: '/work-orders', label: 'İş Emirleri', icon: FiFileText, permission: 'workorder:read' },
];

/**
 * FR-5.2: yetkisi olmayan ekranın menü öğesi gösterilmez.
 */
export function AppShell() {
  const { user, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const initial = user?.fullName?.charAt(0).toUpperCase() || 'E';
  const rolesText = formatRoles(user?.roles);

  return (
    <div className={styles.shell}>
      <aside className={clsx(styles.sidebar, isExpanded && styles.sidebarExpanded)}>
        <div className={styles.brandHeader}>
          <img src="/inv-logo-small.png" alt="inavitas logo" className={styles.brandLogo} />
          <span className={styles.brandTitle}>inavitas</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.filter((item) => hasPermission(item.permission)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(styles.navItem, isActive && styles.navItemActive)}
            >
              <item.icon className={styles.navIcon} />
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userProfile} title={user?.fullName}>
            <div className={styles.avatarBadge}>{initial}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.fullName || user?.email}</span>
              <span className={styles.userRole}>{rolesText}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className={clsx(styles.navItem, styles.logoutButton)}
            title="Çıkış yap"
          >
            <FiLogOut className={styles.navIcon} />
            <span className={styles.navLabel}>Çıkış yap</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className={styles.toggleBtn}
          aria-label={isExpanded ? 'Menüyü daralt' : 'Menüyü genişlet'}
          title={isExpanded ? 'Menüyü daralt' : 'Menüyü genişlet'}
        >
          {isExpanded ? <FiChevronLeft /> : <FiChevronRight />}
        </button>
      </aside>

      <div className={styles.content}>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}


