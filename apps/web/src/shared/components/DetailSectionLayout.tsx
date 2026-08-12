import type { ReactNode } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../../features/i18n/I18nProvider.tsx';
import styles from './DetailSectionLayout.module.scss';

export interface TabConfig<TTabId extends string = string> {
  id: TTabId;
  label: string;
}

export interface DetailSectionLayoutProps<T, TTabId extends string = string> {
  title: ReactNode;
  onBack: () => void;
  items: T[];
  selectedItemId: string;
  getItemKey: (item: T) => string;
  onSelectItem: (item: T) => void;
  renderListItem: (item: T, isSelected: boolean) => ReactNode;
  tabs: TabConfig<TTabId>[];
  activeTab: TTabId;
  onTabChange: (tabId: TTabId) => void;
  children: ReactNode;
}

/**
 * Ortak Master-Detail (Sol 1/3 liste, sağ 2/3 sekmeli detay) yerleşim bileşeni.
 * Kesinti (Outage) ve İş Emri (WorkOrder) sayfalarının yanı sıra gelecekte eklenecek
 * tüm varlık detay görünümleri bu ortak bileşeni tüketir.
 */
export function DetailSectionLayout<T, TTabId extends string = string>({
  title,
  onBack,
  items,
  selectedItemId,
  getItemKey,
  onSelectItem,
  renderListItem,
  tabs,
  activeTab,
  onTabChange,
  children,
}: DetailSectionLayoutProps<T, TTabId>) {
  const { t } = useTranslation();

  return (
    <div className={styles.section}>
      {/* Üst başlık alanı: Geri butonu ve sayfa başlığı */}
      <div className={styles.header}>
        <button
          type="button"
          onClick={onBack}
          className="icon-btn"
          title={t('common.action.back', undefined, 'Geri')}
        >
          <FiArrowLeft />
        </button>
        <h2 className={styles.headerTitle}>{title}</h2>
      </div>

      {/* İki alanlı ana yerleşim: Solda liste (1/3), sağda detay paneli (2/3) */}
      <div className={styles.container}>
        {/* Sol alan: Liste (Başlıksız, doğrudan liste elemanları) */}
        <div className={styles.sidebarCard}>
          <div className={styles.list}>
            {items.map((item) => {
              const key = getItemKey(item);
              const isSelected = key === selectedItemId;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectItem(item)}
                  className={clsx(styles.listItem, isSelected && styles.listItemActive)}
                >
                  {renderListItem(item, isSelected)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sağ alan: Detay paneli ve sekmeli içerik */}
        <div className={styles.detailCard}>
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={clsx(styles.tab, activeTab === tab.id && styles.tabActive)}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.tabContent}>{children}</div>
        </div>
      </div>
    </div>
  );
}
