import { FiCheck, FiChevronRight, FiX } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { VOLTAGE_LEVELS, type VoltageLevel } from '../../types/network.ts';
import { OUTAGE_STATUSES, type OutageFilters } from '../../types/outage.ts';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES, type WorkOrderFilters } from '../../types/work-order.ts';
import { MapPanel } from './MapPanel.tsx';
import { useGroupExpanded } from './useGroupExpanded.ts';
import styles from './MapPanel.module.scss';

interface FiltersPanelProps {
  onClose: () => void;
  voltageLevels: Set<VoltageLevel>;
  onVoltageLevelsChange: (levels: VoltageLevel[]) => void;
  showOutages: boolean;
  showWorkOrders: boolean;
  outageFilters: OutageFilters;
  onOutageFiltersChange: (next: Partial<OutageFilters>) => void;
  workOrderFilters: WorkOrderFilters;
  onWorkOrderFiltersChange: (next: Partial<WorkOrderFilters>) => void;
  /** Sonuç sunucudaki üst sınıra dayandı — kullanıcıya filtreyi daraltması söylenir. */
  outageTruncated: boolean;
  workOrderTruncated: boolean;
}

/** Bir çoklu-seçim listesinde bir değeri açar/kapatır. */
function toggleIn<T>(values: T[] | undefined, value: T): T[] {
  const current = values ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

/**
 * Filtre paneli — gerilim seviyesi çapraz filtresi ile kesinti ve iş emri alt filtreleri.
 *
 * Alt filtreler **mevcut `OutageFilters`/`WorkOrderFilters` arayüzlerini yeniden kullanır**;
 * haritaya paralel bir filtre modeli kurulmaz. Çoklu-seçim grupları katmanlar panelindeki
 * gruplarla aynı davranışı izler: başlıktaki kutu tüm satırları birlikte açar/kapatır.
 */
export function FiltersPanel({
  onClose,
  voltageLevels,
  onVoltageLevelsChange,
  showOutages,
  showWorkOrders,
  outageFilters,
  onOutageFiltersChange,
  workOrderFilters,
  onWorkOrderFiltersChange,
  outageTruncated,
  workOrderTruncated,
}: FiltersPanelProps) {
  const { t } = useTranslation();
  const labels = useLabels();

  return (
    <MapPanel title={t('map.tool.filters')} onClose={onClose}>
      <CheckGroup
        groupKey="filters.voltage"
        title={t('map.filter.voltageLevel.title')}
        values={VOLTAGE_LEVELS}
        selected={Array.from(voltageLevels)}
        labelOf={(level) => t(`network.enum.voltageLevel.${level}`)}
        onChange={onVoltageLevelsChange}
      />

      {/* Katman kapalıyken filtreleri değiştirmek boşa bir işlemdir; alan soluklaşır. */}
      <section className={clsx(styles.group, styles.filterMainSection)}>
        <h3 className={styles.subFilterTitle}>{t('map.legend.section.outages')}</h3>
        <div className={clsx(styles.subFilters, !showOutages && styles.subFiltersDisabled)}>
          {!showOutages && <p className={styles.hint}>{t('map.filter.layerOff')}</p>}
          <CheckGroup
            groupKey="filters.outageStatus"
            title={t('map.filter.status')}
            values={OUTAGE_STATUSES}
            selected={outageFilters.status}
            labelOf={labels.outageStatus}
            onChange={(status) => onOutageFiltersChange({ status })}
          />

          <DateField
            label={t('map.filter.startedAtFrom')}
            value={outageFilters.startedAtFrom}
            onChange={(startedAtFrom) => onOutageFiltersChange({ startedAtFrom })}
          />
          <DateField
            label={t('map.filter.startedAtTo')}
            value={outageFilters.startedAtTo}
            onChange={(startedAtTo) => onOutageFiltersChange({ startedAtTo })}
          />

          <label className={styles.inlineField}>
            {t('map.filter.minAffectedCustomers')}
            <input
              type="number"
              min={0}
              value={outageFilters.minAffectedCustomers ?? ''}
              onChange={(e) =>
                onOutageFiltersChange({ minAffectedCustomers: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </label>
          <label className={styles.inlineField}>
            {t('map.filter.minDuration')}
            <input
              type="number"
              min={0}
              value={outageFilters.durationMinMinutes ?? ''}
              onChange={(e) =>
                onOutageFiltersChange({ durationMinMinutes: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </label>
          <label className={styles.inlineField}>
            {t('map.filter.maxDuration')}
            <input
              type="number"
              min={0}
              value={outageFilters.durationMaxMinutes ?? ''}
              onChange={(e) =>
                onOutageFiltersChange({ durationMaxMinutes: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </label>

          {outageTruncated && <p className={styles.truncatedHint}>{t('map.layer.truncated')}</p>}
        </div>
      </section>

      <section className={clsx(styles.group, styles.filterMainSection)}>
        <h3 className={styles.subFilterTitle}>{t('map.legend.section.workOrders')}</h3>
        <div className={clsx(styles.subFilters, !showWorkOrders && styles.subFiltersDisabled)}>
          {!showWorkOrders && <p className={styles.hint}>{t('map.filter.layerOff')}</p>}
          <CheckGroup
            groupKey="filters.workOrderType"
            title={t('map.filter.type')}
            values={WORK_ORDER_TYPES}
            selected={workOrderFilters.type}
            labelOf={labels.workOrderType}
            onChange={(type) => onWorkOrderFiltersChange({ type })}
          />
          <CheckGroup
            groupKey="filters.workOrderStatus"
            title={t('map.filter.status')}
            values={WORK_ORDER_STATUSES}
            selected={workOrderFilters.status}
            labelOf={labels.workOrderStatus}
            onChange={(status) => onWorkOrderFiltersChange({ status })}
          />

          <DateField
            label={t('map.filter.createdAtFrom')}
            value={workOrderFilters.createdAtFrom}
            onChange={(createdAtFrom) => onWorkOrderFiltersChange({ createdAtFrom })}
          />
          <DateField
            label={t('map.filter.createdAtTo')}
            value={workOrderFilters.createdAtTo}
            onChange={(createdAtTo) => onWorkOrderFiltersChange({ createdAtTo })}
          />

          {workOrderTruncated && <p className={styles.truncatedHint}>{t('map.layer.truncated')}</p>}
        </div>
      </section>
    </MapPanel>
  );
}

/**
 * Çoklu-seçim filtre grubu — katmanlar panelindeki grupla birebir aynı davranış: başlıktaki
 * kutu tüm satırları birlikte açar/kapatır, kısmen seçiliyken kararsız (indeterminate) görünür.
 * Durum, tür ve gerilim filtreleri aynı biçimde çalıştığı için üçü de bunu kullanır.
 */
function CheckGroup<T extends string>({
  groupKey,
  title,
  values,
  selected,
  labelOf,
  onChange,
}: {
  groupKey: string;
  title: string;
  values: readonly T[];
  selected: T[] | undefined;
  labelOf: (value: T) => string;
  onChange: (next: T[]) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, toggleOpen] = useGroupExpanded(groupKey);

  const selectedValues = selected ?? [];
  const checkedCount = values.filter((value) => selectedValues.includes(value)).length;
  const allChecked = values.length > 0 && checkedCount === values.length;
  const toggleAll = () => onChange(allChecked ? [] : [...values]);

  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(node) => {
              if (node) node.indeterminate = checkedCount > 0 && !allChecked;
            }}
            onChange={toggleAll}
            aria-label={t('common.action.selectAll')}
          />
          <span className={styles.checkboxBox}>
            <FiCheck />
          </span>
        </label>
        <button type="button" className={styles.groupToggle} aria-expanded={isOpen} onClick={toggleOpen}>
          <FiChevronRight className={clsx(styles.groupChevron, isOpen && styles.groupChevronOpen)} />
          {title}
        </button>
      </div>

      {isOpen && (
        <div className={styles.groupBody}>
          <ul className={styles.checkList}>
            {values.map((value) => (
              <li key={value} className={styles.checkItem}>
                <label className={styles.checkLabel}>
                  <span className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={selectedValues.includes(value)}
                      onChange={() => onChange(toggleIn(selectedValues, value))}
                    />
                    <span className={styles.checkboxBox}>
                      <FiCheck />
                    </span>
                  </span>
                  {labelOf(value)}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Tarih alanı — değer varken sağında beliren düğme onu tekrar boşaltır; boşken soluk durur. */
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useTranslation();

  return (
    <label className={styles.inlineField}>
      {label}
      <input
        type="date"
        className={clsx(!value && styles.dateInputEmpty)}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {value && (
        <button
          type="button"
          className={clsx('icon-btn', 'icon-btn--sm', styles.dateClear)}
          onClick={() => onChange(undefined)}
          aria-label={t('common.filter.clear', undefined, 'Temizle')}
          title={t('common.filter.clear', undefined, 'Temizle')}
        >
          <FiX />
        </button>
      )}
    </label>
  );
}
