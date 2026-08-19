import { FiChevronRight } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { VOLTAGE_LEVELS, type VoltageLevel } from '../../types/network.ts';
import { OUTAGE_STATUSES, type OutageFilters } from '../../types/outage.ts';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES, type WorkOrderFilters } from '../../types/work-order.ts';
import { Switch } from '../../shared/components/Switch.tsx';
import { LEGEND_COLOR_VAR, LINE_LEGEND_IDS, UNIT_LEGEND_IDS, type LegendId } from './networkLayers.ts';
import styles from './ModePanel.module.scss';

/**
 * Efsane satırlarının etiket anahtarları.
 * Gerilim her yerde **kV** olarak yazılır; HV/MV/LV kısaltması tek başına kullanılmaz.
 */
const LEGEND_LABEL_KEY: Record<LegendId, string> = {
  HV_LINE: 'map.legend.line.hv',
  MV_MAIN: 'map.legend.line.mvMain',
  MV_BRANCH: 'map.legend.line.mvBranch',
  LV_LINE: 'map.legend.line.lv',
  TM: 'map.legend.unit.tm',
  DM: 'map.legend.unit.dm',
  TRANSFORMER: 'map.legend.unit.transformer',
  LV_JUNCTION: 'map.legend.unit.lvJunction',
  SERVICE_ENTRY: 'map.legend.unit.serviceEntry',
};

/** Hat satırları yuvarlak nokta değil çizgi örneğiyle gösterilir. */
const DASHED_LEGEND_IDS = new Set<LegendId>(['HV_LINE', 'MV_MAIN', 'MV_BRANCH', 'LV_LINE']);

interface ModePanelProps {
  isExpanded: boolean;
  onToggleExpanded: () => void;
  legend: Set<LegendId>;
  onToggleLegend: (id: LegendId) => void;
  voltageLevels: Set<VoltageLevel>;
  onToggleVoltageLevel: (level: VoltageLevel) => void;
  showAdminBoundaries: boolean;
  onShowAdminBoundariesChange: (value: boolean) => void;
  showOutages: boolean;
  onShowOutagesChange: (value: boolean) => void;
  showWorkOrders: boolean;
  onShowWorkOrdersChange: (value: boolean) => void;
  showOutageHeatmap: boolean;
  onShowOutageHeatmapChange: (value: boolean) => void;
  outageFilters: OutageFilters;
  onOutageFiltersChange: (next: Partial<OutageFilters>) => void;
  workOrderFilters: WorkOrderFilters;
  onWorkOrderFiltersChange: (next: Partial<WorkOrderFilters>) => void;
  /** Sonuç sunucudaki üst sınıra dayandı — kullanıcıya filtreyi daraltması söylenir. */
  outageTruncated: boolean;
  workOrderTruncated: boolean;
}

/** Kaynak filtresi her iki katmanda da aynı iki değeri alır. */
const ORIGINS = ['USER', 'SYSTEM'] as const;

/** Bir çoklu-seçim listesinde bir değeri açar/kapatır. */
function toggleIn<T>(values: T[] | undefined, value: T): T[] {
  const current = values ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

/**
 * Çoklu-seçim filtre listesi. Durum, kaynak ve tür filtreleri aynı biçimde çalıştığı için
 * üçü de bunu kullanır — aynı işaret kutusu listesi beş kez tekrarlanmaz.
 */
function CheckboxGroup<T extends string>({
  title,
  values,
  selected,
  labelOf,
  onToggle,
}: {
  title: string;
  values: readonly T[];
  selected: T[] | undefined;
  labelOf: (value: T) => string;
  onToggle: (next: T[]) => void;
}) {
  return (
    <>
      <h4 className={styles.subFilterTitle}>{title}</h4>
      <ul className={styles.checkList}>
        {values.map((value) => (
          <li key={value} className={styles.checkItem}>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={selected?.includes(value) ?? false}
                onChange={() => onToggle(toggleIn(selected, value))}
              />
              {labelOf(value)}
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

/** "Var / Yok / Farketmez" üçlü seçicisi — `hasWorkOrder`/`hasOutage` filtreleri için. */
function TriStateField({
  label,
  value,
  onChange,
  anyLabel,
  yesLabel,
  noLabel,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (next: boolean | undefined) => void;
  anyLabel: string;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <label className={styles.inlineField}>
      {label}
      <select
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
      >
        <option value="">{anyLabel}</option>
        <option value="true">{yesLabel}</option>
        <option value="false">{noLabel}</option>
      </select>
    </label>
  );
}

function LegendRow({
  id,
  checked,
  onToggle,
  label,
}: {
  id: LegendId;
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <li className={styles.checkItem}>
      <label className={styles.checkLabel}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span
          className={clsx(styles.swatch, DASHED_LEGEND_IDS.has(id) && styles.swatchLine)}
          style={{ backgroundColor: LEGEND_COLOR_VAR[id] }}
        />
        {label}
      </label>
    </li>
  );
}

/** Sağ panel — hat ve birim katmanları, işletim katmanları ve çapraz filtreler. */
export function ModePanel({
  isExpanded,
  onToggleExpanded,
  legend,
  onToggleLegend,
  voltageLevels,
  onToggleVoltageLevel,
  showAdminBoundaries,
  onShowAdminBoundariesChange,
  showOutages,
  onShowOutagesChange,
  showWorkOrders,
  onShowWorkOrdersChange,
  showOutageHeatmap,
  onShowOutageHeatmapChange,
  outageFilters,
  onOutageFiltersChange,
  workOrderFilters,
  onWorkOrderFiltersChange,
  outageTruncated,
  workOrderTruncated,
}: ModePanelProps) {
  const { t } = useTranslation();
  const labels = useLabels();

  return (
    <aside className={clsx(styles.panel, !isExpanded && styles.panelCollapsed)}>
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={onToggleExpanded}
        aria-label={t(isExpanded ? 'map.panel.mode.collapse' : 'map.panel.mode.expand')}
        title={t(isExpanded ? 'map.panel.mode.collapse' : 'map.panel.mode.expand')}
      >
        <FiChevronRight className={clsx(styles.toggleIcon, isExpanded && styles.toggleIconExpanded)} />
      </button>

      {isExpanded && (
        <div className={styles.body}>
          <h2 className={styles.title}>{t('map.panel.mode.title')}</h2>

          {/* Hatlar birimlerden ayrı katmanlardır — TM'i kapatmak hattı gizlemez. */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('map.legend.section.lines')}</h3>
            <ul className={styles.checkList}>
              {LINE_LEGEND_IDS.map((id) => (
                <LegendRow key={id} id={id} checked={legend.has(id)} onToggle={() => onToggleLegend(id)} label={t(LEGEND_LABEL_KEY[id])} />
              ))}
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('map.legend.section.units')}</h3>
            <ul className={styles.checkList}>
              {UNIT_LEGEND_IDS.map((id) => (
                <LegendRow key={id} id={id} checked={legend.has(id)} onToggle={() => onToggleLegend(id)} label={t(LEGEND_LABEL_KEY[id])} />
              ))}
            </ul>
            <p className={styles.zoomHint}>{t('map.legend.buildingHint')}</p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('map.filter.voltageLevel.title')}</h3>
            <ul className={styles.checkList}>
              {VOLTAGE_LEVELS.map((level) => (
                <li key={level} className={styles.checkItem}>
                  <label className={styles.checkLabel}>
                    <input type="checkbox" checked={voltageLevels.has(level)} onChange={() => onToggleVoltageLevel(level)} />
                    {t(`network.enum.voltageLevel.${level}`)}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {/* Kesintiler — efsanede kendi katman satırı; ayrı bir "mod" anahtarı değil. */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('map.legend.section.outages')}</h3>
            <div className={styles.switchRow}>
              <Switch checked={showOutages} onChange={onShowOutagesChange} label={t('map.layer.outages')} />
              <span>{t('map.layer.outages')}</span>
            </div>

            <div className={clsx(styles.subFilters, !showOutages && styles.subFiltersDisabled)}>
              <CheckboxGroup
                title={t('map.filter.status')}
                values={OUTAGE_STATUSES}
                selected={outageFilters.status}
                labelOf={labels.outageStatus}
                onToggle={(status) => onOutageFiltersChange({ status })}
              />
              <CheckboxGroup
                title={t('map.filter.origin')}
                values={ORIGINS}
                selected={outageFilters.origin}
                labelOf={labels.origin}
                onToggle={(origin) => onOutageFiltersChange({ origin })}
              />

              <label className={styles.inlineField}>
                {t('map.filter.startedAtFrom')}
                <input
                  type="date"
                  value={outageFilters.startedAtFrom ?? ''}
                  onChange={(e) => onOutageFiltersChange({ startedAtFrom: e.target.value })}
                />
              </label>
              <label className={styles.inlineField}>
                {t('map.filter.startedAtTo')}
                <input
                  type="date"
                  value={outageFilters.startedAtTo ?? ''}
                  onChange={(e) => onOutageFiltersChange({ startedAtTo: e.target.value })}
                />
              </label>

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

              <TriStateField
                label={t('map.filter.hasWorkOrder')}
                value={outageFilters.hasWorkOrder}
                onChange={(hasWorkOrder) => onOutageFiltersChange({ hasWorkOrder })}
                anyLabel={t('map.filter.any')}
                yesLabel={t('map.filter.linked')}
                noLabel={t('map.filter.unlinked')}
              />

              {outageTruncated && <p className={styles.truncatedHint}>{t('map.layer.truncated')}</p>}
            </div>
          </section>

          {/* İş emirleri — kesintilerle aynı desende kendi katman satırı. */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('map.legend.section.workOrders')}</h3>
            <div className={styles.switchRow}>
              <Switch checked={showWorkOrders} onChange={onShowWorkOrdersChange} label={t('map.layer.workOrders')} />
              <span>{t('map.layer.workOrders')}</span>
            </div>

            <div className={clsx(styles.subFilters, !showWorkOrders && styles.subFiltersDisabled)}>
              <CheckboxGroup
                title={t('map.filter.type')}
                values={WORK_ORDER_TYPES}
                selected={workOrderFilters.type}
                labelOf={labels.workOrderType}
                onToggle={(type) => onWorkOrderFiltersChange({ type })}
              />
              <CheckboxGroup
                title={t('map.filter.status')}
                values={WORK_ORDER_STATUSES}
                selected={workOrderFilters.status}
                labelOf={labels.workOrderStatus}
                onToggle={(status) => onWorkOrderFiltersChange({ status })}
              />
              <CheckboxGroup
                title={t('map.filter.origin')}
                values={ORIGINS}
                selected={workOrderFilters.origin}
                labelOf={labels.origin}
                onToggle={(origin) => onWorkOrderFiltersChange({ origin })}
              />

              <label className={styles.inlineField}>
                {t('map.filter.createdAtFrom')}
                <input
                  type="date"
                  value={workOrderFilters.createdAtFrom ?? ''}
                  onChange={(e) => onWorkOrderFiltersChange({ createdAtFrom: e.target.value })}
                />
              </label>
              <label className={styles.inlineField}>
                {t('map.filter.createdAtTo')}
                <input
                  type="date"
                  value={workOrderFilters.createdAtTo ?? ''}
                  onChange={(e) => onWorkOrderFiltersChange({ createdAtTo: e.target.value })}
                />
              </label>

              <TriStateField
                label={t('map.filter.hasOutage')}
                value={workOrderFilters.hasOutage}
                onChange={(hasOutage) => onWorkOrderFiltersChange({ hasOutage })}
                anyLabel={t('map.filter.any')}
                yesLabel={t('map.filter.linked')}
                noLabel={t('map.filter.unlinked')}
              />

              {workOrderTruncated && <p className={styles.truncatedHint}>{t('map.layer.truncated')}</p>}
            </div>
          </section>

          {/* Bağımsız katmanlar — hiçbir şebeke veya işletim katmanına bağlı olmayanlar. */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('map.legend.section.independent')}</h3>
            <div className={styles.switchRow}>
              <Switch checked={showAdminBoundaries} onChange={onShowAdminBoundariesChange} label={t('map.layer.adminBoundaries')} />
              <span>{t('map.layer.adminBoundaries')}</span>
            </div>
            <div className={styles.switchRow}>
              <Switch checked={showOutageHeatmap} onChange={onShowOutageHeatmapChange} label={t('map.layer.outageHeatmap')} />
              <span>{t('map.layer.outageHeatmap')}</span>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
