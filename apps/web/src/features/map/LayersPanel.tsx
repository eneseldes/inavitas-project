import { useMemo, type ReactNode } from 'react';
import { FiCheck, FiChevronRight } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { MapPanel } from './MapPanel.tsx';
import { CollapsibleBody } from './CollapsibleBody.tsx';
import { LINE_LEGEND_IDS, UNIT_LEGEND_IDS, type LegendId } from './networkLayers.ts';
import { HEATMAP_IDS, MAP_VISIBLE_OUTAGE_STATUSES, MAP_VISIBLE_WORK_ORDER_STATUSES, type HeatmapId } from './useMapState.ts';
import { useGroupExpanded } from './useGroupExpanded.ts';
import { markerSvg, OPERATION_STATUS_TOKENS, type OperationKind } from './markerIcons.ts';
import type { OutageFilters, OutageStatus } from '../../types/outage.ts';
import { WORK_ORDER_TYPES, type WorkOrderFilters, type WorkOrderStatus, type WorkOrderType } from '../../types/work-order.ts';
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
  showDeEnergized: boolean;
  onShowDeEnergizedChange: (value: boolean) => void;
  showOutages: boolean;
  onShowOutagesChange: (value: boolean) => void;
  showWorkOrders: boolean;
  onShowWorkOrdersChange: (value: boolean) => void;
  /** Aynı anda yalnız biri seçili olabilir — birden çok ısı haritası mantıken karışırdı. */
  activeHeatmap: HeatmapId | undefined;
  onActiveHeatmapChange: (id: HeatmapId | undefined) => void;
  outageFilters: OutageFilters;
  onOutageFiltersChange: (next: Partial<OutageFilters>) => void;
  workOrderFilters: WorkOrderFilters;
  onWorkOrderFiltersChange: (next: Partial<WorkOrderFilters>) => void;
}

/** Bir çoklu-seçim listesinde bir değeri açar/kapatır. */
function toggleIn<T>(values: T[] | undefined, value: T): T[] {
  const current = values ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

/**
 * Katman paneli — düz bir katman listesi, başlığa göre katlanabilir gruplara ayrılmış.
 *
 * Grup başlığındaki işaret kutusu gruptaki tüm satırları birlikte açıp kapatır; bir kısmı
 * açıksa kararsız (indeterminate) görünür. Kesinti ve iş emri satırlarının kendi durum
 * (ve iş emrinde ayrıca tür) alt filtreleri VAR — her satır kendi başına bir daha
 * katlanabilir, tıpkı üst gruplar gibi. Isı haritası ise onlardan ayrı — türü ne olursa
 * olsun ısı haritaları birbirini dışlar, o yüzden burada tekil seçim (radyo) olarak çalışır.
 */
export function LayersPanel({
  onClose,
  legend,
  onToggleLegend,
  onToggleLegendGroup,
  showAdminBoundaries,
  onShowAdminBoundariesChange,
  showDeEnergized,
  onShowDeEnergizedChange,
  showOutages,
  onShowOutagesChange,
  showWorkOrders,
  onShowWorkOrdersChange,
  activeHeatmap,
  onActiveHeatmapChange,
  outageFilters,
  onOutageFiltersChange,
  workOrderFilters,
  onWorkOrderFiltersChange,
}: LayersPanelProps) {
  const { t } = useTranslation();
  const labels = useLabels();

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
      />

      {/* Kesintiler ve iş emirleri artık İKİ AYRI satır — eskiden ortak "Kesinti ve İş
          Emirleri" başlığı altında tek bir grup halindeydi, kendi durum (ve iş emrinde
          ayrıca tür) alt filtreleri de dahil olmak üzere birbirinden bağımsız katmanlar. */}
      {/* Kesintiler'in TEK alt filtresi var (durum) — ayrı bir "Durum" başlığına/katlanmasına
          gerek yok, liste açılınca doğrudan görünür. Birden fazla alt filtresi olan İş
          Emirleri'nde (Tür + Durum) ise her biri kendi başlığıyla ayrı kalır, altta. */}
      <OperationGroup
        groupKey="layers.outages"
        title={t('map.legend.section.outages')}
        kind="outage"
        checked={showOutages}
        onToggle={() => onShowOutagesChange(!showOutages)}
      >
        <StatusChecklist
          kind="outage"
          values={MAP_VISIBLE_OUTAGE_STATUSES}
          selected={outageFilters.status}
          labelOf={labels.outageStatus}
          onChange={(status: OutageStatus[]) => onOutageFiltersChange({ status })}
        />
      </OperationGroup>

      <OperationGroup
        groupKey="layers.workOrders"
        title={t('map.legend.section.workOrders')}
        kind="workOrder"
        checked={showWorkOrders}
        onToggle={() => onShowWorkOrdersChange(!showWorkOrders)}
      >
        <SubGroup
          groupKey="layers.workOrders.type"
          title={t('map.filter.type')}
          values={WORK_ORDER_TYPES}
          selected={workOrderFilters.type}
          labelOf={labels.workOrderType}
          onChange={(type: WorkOrderType[]) => onWorkOrderFiltersChange({ type })}
        />
        <SubGroup
          groupKey="layers.workOrders.status"
          title={t('map.filter.status')}
          values={MAP_VISIBLE_WORK_ORDER_STATUSES}
          selected={workOrderFilters.status}
          labelOf={labels.workOrderStatus}
          onChange={(status: WorkOrderStatus[]) => onWorkOrderFiltersChange({ status })}
          badge={(value) => <MarkerBadge kind="workOrder" colorToken={OPERATION_STATUS_TOKENS.workOrder[value]!} />}
        />
      </OperationGroup>

      <HeatmapGroup activeHeatmap={activeHeatmap} onActiveHeatmapChange={onActiveHeatmapChange} />

      {/* Kendi grup gövdesi olmayan tekil katmanlar — her biri tek satır. Enerjisiz bölgeler
          kapatılabilir olmalı: kalabalık bir kesinti gününde harita aksi halde okunmaz olur. */}
      <section className={styles.group}>
        <div className={styles.groupHeader}>
          <label className={clsx(styles.checkLabel, styles.simpleRow)}>
            <span className={styles.checkbox}>
              <input
                type="checkbox"
                checked={showDeEnergized}
                onChange={() => onShowDeEnergizedChange(!showDeEnergized)}
              />
              <span className={styles.checkboxBox}>
                <FiCheck />
              </span>
            </span>
            <span className={clsx(styles.swatch, styles.swatchDeEnergized)} aria-hidden />
            {t('map.layer.deEnergized')}
          </label>
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.groupHeader}>
          <label className={clsx(styles.checkLabel, styles.simpleRow)}>
            <span className={styles.checkbox}>
              <input
                type="checkbox"
                checked={showAdminBoundaries}
                onChange={() => onShowAdminBoundariesChange(!showAdminBoundaries)}
              />
              <span className={styles.checkboxBox}>
                <FiCheck />
              </span>
            </span>
            {t('map.layer.adminBoundaries')}
          </label>
        </div>
      </section>
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

      <CollapsibleBody isOpen={isOpen}>
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
      </CollapsibleBody>
    </section>
  );
}

/** Haritadaki işaretçinin küçük, birebir aynı görünümlü kopyası — durum rengiyle boyanır. */
function MarkerBadge({ kind, colorToken }: { kind: OperationKind; colorToken: string }) {
  const svg = useMemo(
    () => markerSvg(kind, `var(${colorToken})`, 'var(--c-map-op-stroke)', 'var(--c-map-marker-ink)'),
    [kind, colorToken],
  );
  // Görsel tamamen bu dosyada üretilir (kullanıcı girdisi yok) — güvenli.
  return <span className={styles.markerBadge} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * Kesinti/iş emri katmanı — "Hatlar"/"Birimler" ile AYNI görsel ağırlıkta, bağımsız bir üst
 * grup satırı (eskiden ikisi ortak bir "Kesinti ve İş Emirleri" başlığı altında tek gruptu).
 * Kendi görünürlük kutusu + haritadaki rozetin küçük kopyası + alt filtrelere açılan kendi
 * katlanır gövdesi var; alt filtreler (`SubGroup`) BİR ALT SEVİYE — kendi "hepsini seç"
 * kutusu olan ama daha küçük/soluk göründüğü için ana grup başlığıyla karıştırılmayan
 * ayrı bir hiyerarşi kademesi.
 */
function OperationGroup({
  groupKey,
  title,
  kind,
  checked,
  onToggle,
  children,
}: {
  groupKey: string;
  title: string;
  kind: OperationKind;
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const [isOpen, toggleOpen] = useGroupExpanded(groupKey);

  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={checked} onChange={onToggle} />
          <span className={styles.checkboxBox}>
            <FiCheck />
          </span>
        </label>
        <button type="button" className={styles.groupToggle} aria-expanded={isOpen} onClick={toggleOpen}>
          <FiChevronRight className={clsx(styles.groupChevron, isOpen && styles.groupChevronOpen)} />
          <MarkerBadge kind={kind} colorToken={OPERATION_STATUS_TOKENS[kind].STARTED!} />
          {title}
        </button>
      </div>
      <CollapsibleBody isOpen={isOpen}>
        <div className={styles.groupBody}>{children}</div>
      </CollapsibleBody>
    </section>
  );
}

/**
 * Alt filtre grubu (İş Emirleri'ndeki Tür, Durum) — `OperationGroup`'un İÇİNDE yaşar ama
 * BİRDEN FAZLA alt filtre olduğu için (Kesintiler'de tek filtre var, bkz. `StatusChecklist`)
 * her biri kendi başına tam teşekküllü bir grup gibi görünür: üst gruple (Hatlar, Elemanlar,
 * Kesintiler, İş Emirleri) BİREBİR AYNI görsel ağırlık (`.groupHeader`/`.groupToggle`) —
 * küçültülmüş/soluk bir "alt kademe" değil, sadece konum olarak içeride. Kendi "hepsini seç"
 * kutusu var. `badge` verilirse (durum gibi haritada renk taşıyan bir alan) her satırın
 * solunda haritadaki rozetin o değere ait küçük kopyası durur; tür gibi renksiz bir alanda
 * `badge` hiç verilmez.
 */
function SubGroup<T extends string>({
  groupKey,
  title,
  values,
  selected,
  labelOf,
  onChange,
  badge,
}: {
  groupKey: string;
  title: string;
  values: readonly T[];
  selected: T[] | undefined;
  labelOf: (value: T) => string;
  onChange: (next: T[]) => void;
  badge?: (value: T) => ReactNode;
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
      <CollapsibleBody isOpen={isOpen}>
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
                  {badge?.(value)}
                  {labelOf(value)}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleBody>
    </section>
  );
}

/**
 * Kesintiler'in tek alt filtresi (durum) — `SubGroup`'un aksine ayrı bir başlığı/katlanması
 * YOK: tek şey olduğu için isimlendirilecek bir "kategori" yok, `OperationGroup` açılınca
 * liste doğrudan görünür.
 */
function StatusChecklist<T extends string>({
  kind,
  values,
  selected,
  labelOf,
  onChange,
}: {
  kind: OperationKind;
  values: readonly T[];
  selected: T[] | undefined;
  labelOf: (value: T) => string;
  onChange: (next: T[]) => void;
}) {
  const selectedValues = selected ?? [];

  return (
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
            <MarkerBadge kind={kind} colorToken={OPERATION_STATUS_TOKENS[kind][value]!} />
            {labelOf(value)}
          </label>
        </li>
      ))}
    </ul>
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

      <CollapsibleBody isOpen={isOpen}>
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
      </CollapsibleBody>
    </section>
  );
}
