import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { RolesView } from './roles/RolesView.tsx';
import { UsersView } from './users/UsersView.tsx';
import styles from './UserManagementPage.module.scss';

type Segment = 'users' | 'roles';

export function UserManagementPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const view = (searchParams.get('view') as Segment) ?? 'users';

  const setView = (v: Segment) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('user-management.page.title')}</h1>
        <div className={styles.tabContainer}>
          <div className={clsx(styles.tabIndicator, view === 'roles' && styles.tabIndicatorRoles)} />
          <button
            type="button"
            className={clsx(styles.tabBtn, view === 'users' && styles.tabBtnActive)}
            onClick={() => setView('users')}
          >
            {t('user-management.segment.users', undefined, 'Kullanıcılar')}
          </button>
          <button
            type="button"
            className={clsx(styles.tabBtn, view === 'roles' && styles.tabBtnActive)}
            onClick={() => setView('roles')}
          >
            {t('user-management.segment.roles', undefined, 'Roller')}
          </button>
        </div>
      </div>

      {view === 'users' ? <UsersView /> : <RolesView />}
    </div>
  );
}
