import { FiChevronRight } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { VOLTAGE_LEVELS, type VoltageLevel } from '../../types/network.ts';
import { Switch } from '../../shared/components/Switch.tsx';
import { LEGEND_COLOR_VAR, LINE_LEGEND_IDS, UNIT_LEGEND_IDS, type LegendId } from './networkLayers.ts';
import styles from './ModePanel.module.scss';

/**
 * Efsane etiketleri — ankara-yeni-detayli-v3.html'deki katman listesinin karşılığı.
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
  CUSTOMER: 'map.legend.unit.customer',
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

/** Sağ panel — hat ve birim katmanları (v3 hiyerarşisi) + gerilim filtresi. */
export function ModePanel({
  isExpanded,
  onToggleExpanded,
  legend,
  onToggleLegend,
  voltageLevels,
  onToggleVoltageLevel,
  showAdminBoundaries,
  onShowAdminBoundariesChange,
}: ModePanelProps) {
  const { t } = useTranslation();

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

          <section className={styles.section}>
            <div className={styles.switchRow}>
              <Switch checked={showAdminBoundaries} onChange={onShowAdminBoundariesChange} label={t('map.layer.adminBoundaries')} />
              <span>{t('map.layer.adminBoundaries')}</span>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
