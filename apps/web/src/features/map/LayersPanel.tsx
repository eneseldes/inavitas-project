import type { ReactNode } from 'react';
import { FiCheck, FiChevronRight } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { MapPanel } from './MapPanel.tsx';
import { LINE_LEGEND_IDS, UNIT_LEGEND_IDS, type LegendId } from './networkLayers.ts';
import { HEATMAP_IDS, type HeatmapId } from './useMapState.ts';
import { useGroupExpanded } from './useGroupExpanded.ts';
import styles from './MapPanel.module.scss';

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

/** Satırın renk örneğinin biçimi — hat kısa çizgi, birim nokta, işletim kaydı işaretçidir. */
type SwatchKind = 'line' | 'dot' | 'marker';

/**
 * Efsane örneğinin rengi satır verisinde değil, stil dosyasındaki kendi sınıfında durur —
 * bileşen hiçbir renk değeri (token bile olsa) taşımaz.
 */
const LEGEND_SWATCH_CLASS: Record<LegendId, string> = {
  HV_LINE: styles.swatchHvLine!,
  MV_MAIN: styles.swatchMvMain!,
  MV_BRANCH: styles.swatchMvBranch!,
  LV_LINE: styles.swatchLvLine!,
  TM: styles.swatchTm!,
  DM: styles.swatchDm!,
  TRANSFORMER: styles.swatchTransformer!,
  LV_JUNCTION: styles.swatchLvJunction!,
  SERVICE_ENTRY: styles.swatchServiceEntry!,
};

/** Isı haritası seçeneklerinin etiket anahtarı — bugün yalnız kesinti yoğunluğu var. */
const HEATMAP_LABEL_KEY: Record<HeatmapId, string> = {
  outage: 'map.layer.outageHeatmap',
};

interface LayerRow {
  key: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  swatchClass?: string;
  swatchKind?: SwatchKind;
}

interface LayersPanelProps {
  onClose: () => void;
  legend: Set<LegendId>;
  onToggleLegend: (id: LegendId) => void;
  onToggleLegendGroup: (ids: readonly LegendId[]) => void;
  showAdminBoundaries: boolean;
  onShowAdminBoundariesChange: (value: boolean) => void;
  showOutages: boolean;
  onShowOutagesChange: (value: boolean) => void;
  showWorkOrders: boolean;
  onShowWorkOrdersChange: (value: boolean) => void;
  /** İkisini TEK ATOMİK yazımla değiştirir — bkz. `onToggleAll` yorumu. */
  onShowOperationsLayersChange: (value: boolean) => void;
  /** Aynı anda yalnız biri seçili olabilir — birden çok ısı haritası mantıken karışırdı. */
  activeHeatmap: HeatmapId | undefined;
  onActiveHeatmapChange: (id: HeatmapId | undefined) => void;
}

/**
 * Katman paneli — düz bir katman listesi, başlığa göre katlanabilir gruplara ayrılmış.
 *
 * Grup başlığındaki işaret kutusu gruptaki tüm satırları birlikte açıp kapatır; bir kısmı
 * açıksa kararsız (indeterminate) görünür. Kesinti ve iş emri kayıtları tek bir grupta
 * ("İşletim Kayıtları"), ısı haritası ise onlardan ayrı — türü ne olursa olsun ısı
 * haritaları birbirini dışlar, o yüzden burada tekil seçim (radyo) olarak çalışır.
 */
export function LayersPanel({
  onClose,
  legend,
  onToggleLegend,
  onToggleLegendGroup,
  showAdminBoundaries,
  onShowAdminBoundariesChange,
  showOutages,
  onShowOutagesChange,
  showWorkOrders,
  onShowWorkOrdersChange,
  onShowOperationsLayersChange,
  activeHeatmap,
  onActiveHeatmapChange,
}: LayersPanelProps) {
  const { t } = useTranslation();

  const legendRow = (id: LegendId, swatchKind: SwatchKind): LayerRow => ({
    key: id,
    label: t(LEGEND_LABEL_KEY[id]),
    checked: legend.has(id),
    onToggle: () => onToggleLegend(id),
    swatchClass: LEGEND_SWATCH_CLASS[id],
    swatchKind,
  });

  return (
    <MapPanel title={t('map.tool.layers')} onClose={onClose}>
      {/* Hatlar birimlerden ayrı katmanlardır — TM'i kapatmak hattı gizlemez. */}
      <LayerGroup
        groupKey="layers.lines"
        title={t('map.legend.section.lines')}
        rows={LINE_LEGEND_IDS.map((id) => legendRow(id, 'line'))}
        onToggleAll={() => onToggleLegendGroup(LINE_LEGEND_IDS)}
      />

      <LayerGroup
        groupKey="layers.units"
        title={t('map.legend.section.units')}
        rows={UNIT_LEGEND_IDS.map((id) => legendRow(id, 'dot'))}
        onToggleAll={() => onToggleLegendGroup(UNIT_LEGEND_IDS)}
        footer={<p className={styles.zoomHint}>{t('map.legend.buildingHint')}</p>}
      />

      <LayerGroup
        groupKey="layers.operations"
        title={t('map.legend.section.operations', undefined, 'Kesinti ve İş Emirleri')}
        rows={[
          {
            key: 'outages',
            label: t('map.layer.outages'),
            checked: showOutages,
            onToggle: () => onShowOutagesChange(!showOutages),
            swatchClass: styles.swatchOutage!,
            swatchKind: 'marker',
          },
          {
            key: 'workOrders',
            label: t('map.layer.workOrders'),
            checked: showWorkOrders,
            onToggle: () => onShowWorkOrdersChange(!showWorkOrders),
            swatchClass: styles.swatchWorkOrder!,
            swatchKind: 'marker',
          },
        ]}
        onToggleAll={() => onShowOperationsLayersChange(!(showOutages && showWorkOrders))}
      />

      <HeatmapGroup activeHeatmap={activeHeatmap} onActiveHeatmapChange={onActiveHeatmapChange} />

      <LayerGroup
        groupKey="layers.independent"
        title={t('map.legend.section.independent')}
        rows={[
          {
            key: 'boundaries',
            label: t('map.layer.adminBoundaries'),
            checked: showAdminBoundaries,
            onToggle: () => onShowAdminBoundariesChange(!showAdminBoundaries),
            swatchClass: styles.swatchBoundary!,
            swatchKind: 'dot',
          },
        ]}
        onToggleAll={() => onShowAdminBoundariesChange(!showAdminBoundaries)}
      />
    </MapPanel>
  );
}

/** Başlığa göre katlanabilen katman grubu; başlıktaki kutu gruptaki her satırı birlikte çevirir. */
function LayerGroup({
  groupKey,
  title,
  rows,
  onToggleAll,
  footer,
}: {
  groupKey: string;
  title: string;
  rows: LayerRow[];
  onToggleAll: () => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const [isOpen, toggleOpen] = useGroupExpanded(groupKey);

  const checkedCount = rows.filter((row) => row.checked).length;
  const allChecked = checkedCount === rows.length;

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
            onChange={onToggleAll}
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
            {rows.map((row) => (
              <li key={row.key} className={styles.checkItem}>
                <label className={styles.checkLabel}>
                  <span className={styles.checkbox}>
                    <input type="checkbox" checked={row.checked} onChange={row.onToggle} />
                    <span className={styles.checkboxBox}>
                      <FiCheck />
                    </span>
                  </span>
                  {row.swatchClass && (
                    <span
                      className={clsx(
                        styles.swatch,
                        row.swatchKind === 'line' && styles.swatchLine,
                        row.swatchKind === 'marker' && styles.swatchMarker,
                        row.swatchClass,
                      )}
                    />
                  )}
                  {row.label}
                </label>
              </li>
            ))}
          </ul>
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * Isı haritası grubu — "hepsini seç" yok, çünkü tekil seçimdir. Bugün tek seçenek olsa da
 * yapı çoğul: yeni bir ısı haritası türü eklendiğinde de aynı anda yalnız biri seçili kalır.
 * Seçili seçeneğe tekrar basmak ısı haritasını kapatır (düz radyo bunu desteklemez).
 */
function HeatmapGroup({
  activeHeatmap,
  onActiveHeatmapChange,
}: {
  activeHeatmap: HeatmapId | undefined;
  onActiveHeatmapChange: (id: HeatmapId | undefined) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, toggleOpen] = useGroupExpanded('layers.heatmap');

  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <button type="button" className={styles.groupToggle} aria-expanded={isOpen} onClick={toggleOpen}>
          <FiChevronRight className={clsx(styles.groupChevron, isOpen && styles.groupChevronOpen)} />
          {t('map.legend.section.heatmap', undefined, 'Isı Haritası')}
        </button>
      </div>

      {isOpen && (
        <div className={styles.groupBody}>
          <ul className={styles.checkList}>
            {HEATMAP_IDS.map((id) => (
              <li key={id} className={styles.checkItem}>
                <label className={styles.checkLabel}>
                  <span className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={activeHeatmap === id}
                      onChange={() => onActiveHeatmapChange(activeHeatmap === id ? undefined : id)}
                    />
                    <span className={styles.checkboxBox}>
                      <FiCheck />
                    </span>
                  </span>
                  <span className={clsx(styles.swatch, styles.swatchHeatmap)} />
                  {t(HEATMAP_LABEL_KEY[id])}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
