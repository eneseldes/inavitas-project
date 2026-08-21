import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { FiChevronRight, FiHome, FiMap, FiMapPin, FiSearch } from 'react-icons/fi';
import { useDebounce } from '../../../shared/hooks/useDebounce.ts';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { UnitLevel } from '../../../types/user-management.ts';
import { UnitTree } from './UnitTree.tsx';
import styles from './UnitsView.module.scss';

/** Seviye → rozet rengi. Kesinti/iş emri rozetleriyle aynı `badge--*` sınıfları kullanılır. */
const LEVEL_BADGE: Record<UnitLevel, string> = {
  PROVINCE: 'badge--blue',
  DISTRICT: 'badge--cyan',
  NEIGHBORHOOD: 'badge--gray',
};

/**
 * Birimler sekmesi — **salt-okunur**. İdari birimler seed verisidir (envanter yönetimi
 * kapsam dışı); bu ekran bir görüntüleme ve kapsam referansıdır, ekleme/silme yoktur.
 */
export function UnitsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <FiSearch />
          <input
            type="search"
            autoComplete="off"
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('user-management.unit.filter.namePlaceholder')}
          />
        </label>
        <p className={styles.note}>{t('user-management.unit.readOnlyNote')}</p>
      </div>

      <div className={styles.table}>
        <div className={clsx(styles.row, styles.headRow)}>
          <span>{t('user-management.unit.column.name')}</span>
          <span>{t('user-management.unit.column.level')}</span>
          <span>{t('user-management.unit.column.path')}</span>
          <span className={styles.numeric}>{t('user-management.unit.column.children')}</span>
          <span className={styles.numeric}>{t('user-management.unit.column.users')}</span>
          <span />
        </div>

        <UnitTree
          search={debouncedSearch}
          fallback={({ isLoading }) => (
            <p className={styles.empty}>
              {isLoading ? t('common.loading') : t('user-management.unit.table.empty')}
            </p>
          )}
        >
          {({ unit, depth, isExpanded, hasChildren, toggle }) => (
            <div className={styles.row}>
              <span className={styles.nameCell} style={{ paddingInlineStart: `${depth * 20}px` }}>
                <button
                  type="button"
                  className={clsx(styles.chevron, isExpanded && styles.chevronOpen)}
                  onClick={toggle}
                  disabled={!hasChildren}
                  aria-label={t('common.action.expandMenu')}
                >
                  {hasChildren && <FiChevronRight />}
                </button>
                {unit.level === 'NEIGHBORHOOD' ? <FiMapPin className={styles.levelIcon} /> : <FiHome className={styles.levelIcon} />}
                <span className={styles.name}>{unit.name}</span>
              </span>
              <span>
                <span className={clsx('badge', LEVEL_BADGE[unit.level])}>
                  {t(`user-management.unit.level.${unit.level}`)}
                </span>
              </span>
              <span className="font-mono text-muted">{unit.path}</span>
              <span className={clsx(styles.numeric, 'text-muted')}>
                {unit.childCount > 0 ? unit.childCount.toLocaleString('tr-TR') : '—'}
              </span>
              <span className={clsx(styles.numeric, 'text-muted')}>
                {unit.userCount > 0 ? unit.userCount.toLocaleString('tr-TR') : '—'}
              </span>
              <span className={styles.actions}>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  title={t('user-management.unit.action.showOnMap')}
                  onClick={() => navigate(`/map?unit=${unit.path}`)}
                >
                  <FiMap />
                </button>
              </span>
            </div>
          )}
        </UnitTree>
      </div>
    </div>
  );
}
