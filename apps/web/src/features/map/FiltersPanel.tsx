import { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useDebounce } from '../../shared/hooks/useDebounce.ts';
import type { OutageFilters } from '../../types/outage.ts';
import type { WorkOrderFilters } from '../../types/work-order.ts';
import { MapPanel } from './MapPanel.tsx';
import styles from './MapPanel.module.scss';

interface FiltersPanelProps {
  onClose: () => void;
  outageFilters: OutageFilters;
  onOutageFiltersChange: (next: Partial<OutageFilters>) => void;
  workOrderFilters: WorkOrderFilters;
  onWorkOrderFiltersChange: (next: Partial<WorkOrderFilters>) => void;
  workOrderTruncated: boolean;
}

/**
 * Filtre paneli — kesinti/iş emri ortak tarih filtresi. Gerilim seviyesi çapraz filtresi
 * burada YOK — katman filtreleme amacıyla `useMapState`/`MapView` içinde hâlâ var (alan
 * seçimi sonuçları da onu kullanır), ama bu panelde ayrı bir kontrolü olmadığı için her
 * zaman "hepsi açık" varsayılanında kalır.
 *
 * Durum ve tür alt filtreleri artık BURADA değil, Katmanlar panelindeki ilgili satırın
 * kendi alt grubunda yaşıyor (bkz. LayersPanel.tsx `OperationsGroup`) — bu panel yalnız
 * tarih gibi katmandan bağımsız kısıtları taşır. Tarih girdisi her tuş vuruşunda değil,
 * kullanıcı yazmayı bıraktıktan bir süre sonra (debounce) sunucuya gider.
 */
export function FiltersPanel({
  onClose,
  outageFilters,
  onOutageFiltersChange,
  workOrderFilters,
  onWorkOrderFiltersChange,
  workOrderTruncated,
}: FiltersPanelProps) {
  const { t } = useTranslation();

  const sinceDate = outageFilters.startedAtFrom ?? workOrderFilters.createdAtFrom;
  const setSinceDate = (next: string | undefined) => {
    onOutageFiltersChange({ startedAtFrom: next });
    onWorkOrderFiltersChange({ createdAtFrom: next });
  };

  return (
    <MapPanel title={t('map.tool.filters')} onClose={onClose}>
      <section className={styles.group}>
        <h3 className={styles.subFilterTitle}>
          {t('map.filter.dateSection.title', undefined, 'Kesinti ve İş Emri Tarihi')}
        </h3>
        <DebouncedDateField label={t('map.filter.sinceDate', undefined, 'Şu tarihten itibaren')} value={sinceDate} onCommit={setSinceDate} />
        {workOrderTruncated && <p className={styles.truncatedHint}>{t('map.layer.truncated')}</p>}
      </section>
    </MapPanel>
  );
}

/** Bir debounce'lu alanın ilk render'da (henüz kullanıcı hiçbir şey değiştirmemişken) üst bileşene yazmasını önler. */
function useSkipFirst(effect: () => void, deps: unknown[]) {
  const isFirst = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const DEBOUNCE_MS = 400;

/** Tarih alanı — değer varken sağında beliren düğme onu tekrar boşaltır; boşken soluk durur. */
function DebouncedDateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | undefined;
  onCommit: (next: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState(value ?? '');
  useEffect(() => {
    setRaw(value ?? '');
  }, [value]);

  const debouncedRaw = useDebounce(raw, DEBOUNCE_MS);
  useSkipFirst(() => {
    onCommit(debouncedRaw || undefined);
  }, [debouncedRaw]);

  const clear = () => {
    setRaw('');
    onCommit(undefined);
  };

  return (
    <label className={styles.inlineField}>
      {label}
      <input
        type="date"
        autoComplete="off"
        className={clsx(!raw && styles.dateInputEmpty)}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {raw && (
        <button
          type="button"
          className={clsx('icon-btn', 'icon-btn--sm', styles.dateClear)}
          onClick={clear}
          aria-label={t('common.filter.clear', undefined, 'Temizle')}
          title={t('common.filter.clear', undefined, 'Temizle')}
        >
          <FiX />
        </button>
      )}
    </label>
  );
}
