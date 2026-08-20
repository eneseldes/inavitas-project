import { useState, type ComponentType, type MouseEvent } from 'react';
import { FiChevronLeft, FiChevronRight, FiLogOut, FiMap, FiSettings, FiTool, FiUsers, FiZap } from 'react-icons/fi';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../features/auth/useAuth.tsx';
import { TranslationStream, useTranslation } from '../../features/i18n/I18nProvider.tsx';
import { useLabels } from '../../features/i18n/useLabels.ts';
import { TranslationManagerModal } from '../../features/translations/TranslationManagerModal.tsx';
import { SettingsMenu } from './SettingsMenu.tsx';
import styles from './AppShell.module.scss';

interface NavItem {
  to: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  permission: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/outages', labelKey: 'outage.page.title', icon: FiZap, permission: 'outage:read' },
  { to: '/work-orders', labelKey: 'work-order.page.title', icon: FiTool, permission: 'workorder:read' },
  { to: '/map', labelKey: 'map.page.title', icon: FiMap, permission: 'network:read' },
  { to: '/users', labelKey: 'user-management.page.title', icon: FiUsers, permission: 'user:manage' },
];

/** Ana uygulama düzeni ve gezinti menüsü. Yetkisi olmayan menü öğeleri gizlenir. */
export function AppShell() {
  const { user, hasPermission, logout } = useAuth();
  const { t } = useTranslation();
  const labels = useLabels();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [isTranslationsOpen, setIsTranslationsOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const openSettings = (e: MouseEvent<HTMLElement>) => setSettingsAnchor(e.currentTarget);
  const closeSettings = () => setSettingsAnchor(null);

  const initial = user?.fullName?.charAt(0).toUpperCase() || 'E';
  const rolesText = labels.roles(user?.roles);

  return (
    <div className={styles.shell}>
      <TranslationStream />
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
              <span className={styles.navLabel}>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userProfile} title={user?.fullName}>
            <button
              type="button"
              className={styles.avatarBadge}
              aria-haspopup="menu"
              aria-label={t('settings.title')}
              onClick={openSettings}
            >
              {initial}
            </button>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.fullName || user?.email}</span>
              <span className={styles.userRole}>{rolesText}</span>
            </div>
            <button
              type="button"
              className={clsx('icon-btn', 'icon-btn--sm', styles.settingsBtn)}
              aria-haspopup="menu"
              aria-label={t('settings.title')}
              title={t('settings.title')}
              onClick={openSettings}
            >
              <FiSettings />
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className={clsx(styles.navItem, styles.logoutButton)}
            title={t('common.action.logout')}
          >
            <FiLogOut className={styles.navIcon} />
            <span className={styles.navLabel}>{t('common.action.logout')}</span>
          </button>
        </div>

        <SettingsMenu
          anchorEl={settingsAnchor}
          open={settingsAnchor !== null}
          onClose={closeSettings}
          canManageTranslations={hasPermission('translation:read')}
          onManageTranslations={() => {
            closeSettings();
            setIsTranslationsOpen(true);
          }}
        />

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className={styles.toggleBtn}
          aria-label={isExpanded ? t('common.action.collapseMenu') : t('common.action.expandMenu')}
          title={isExpanded ? t('common.action.collapseMenu') : t('common.action.expandMenu')}
        >
          {isExpanded ? <FiChevronLeft /> : <FiChevronRight />}
        </button>
      </aside>

      <div className={styles.content}>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      {isTranslationsOpen && <TranslationManagerModal onClose={() => setIsTranslationsOpen(false)} />}
    </div>
  );
}
