import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { RolesView } from './roles/RolesView.tsx';
import { UnitsView } from './units/UnitsView.tsx';
import { UsersView } from './users/UsersView.tsx';
import styles from './UserManagementPage.module.scss';

const SEGMENTS = ['users', 'roles', 'units'] as const;
type Segment = (typeof SEGMENTS)[number];

const VIEWS: Record<Segment, () => React.ReactElement> = {
  users: UsersView,
  roles: RolesView,
  units: UnitsView,
};

export function UserManagementPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get('view');
  const view: Segment = SEGMENTS.includes(raw as Segment) ? (raw as Segment) : 'users';
  const ActiveView = VIEWS[view];

  const setView = (v: Segment) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('user-management.page.title')}</h1>
        {/*
          Gösterge sekme sayısına göre CSS değişkenlerinden hesaplanır — eskiden iki sekmeye
          göre sabit kodlanmıştı ve üçüncü sekmede yanlış sekmenin altında kalırdı.
        */}
        <div
          className={styles.tabContainer}
          style={{ '--tab-count': SEGMENTS.length, '--tab-index': SEGMENTS.indexOf(view) } as React.CSSProperties}
        >
          <div className={styles.tabIndicator} />
          {SEGMENTS.map((segment) => (
            <button
              key={segment}
              type="button"
              className={clsx(styles.tabBtn, view === segment && styles.tabBtnActive)}
              onClick={() => setView(segment)}
            >
              {t(`user-management.segment.${segment}`)}
            </button>
          ))}
        </div>
      </div>

      <ActiveView />
    </div>
  );
}
