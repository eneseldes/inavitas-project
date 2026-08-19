import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VOLTAGE_LEVELS, type VoltageLevel } from '../../types/network.ts';
import { OUTAGE_STATUSES, type OutageFilters, type OutageStatus } from '../../types/outage.ts';
import {
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
  type WorkOrderFilters,
  type WorkOrderStatus,
} from '../../types/work-order.ts';
import { LEGEND_IDS, type LegendId } from './networkLayers.ts';

/** Ankara il merkezi — bir dış odaklama (`focus`/`unit`) yoksa haritanın açılış görünümü. */
export const DEFAULT_VIEW = { lng: 32.85, lat: 39.92, zoom: 10 };

/** `?layers=` için "hiçbiri" sentinel'i — boş string varsayılan kümeye düşerdi. */
const NO_LAYERS = 'none';

/**
 * Seçilebilir ısı haritası türleri. Bugün yalnız kesinti yoğunluğu var ama liste bilerek
 * çoğul — yeni bir tür eklendiğinde de aynı anda yalnız biri anlamlı olacağından yapı
 * (tekil seçim) baştan buna göre kurulur.
 */
export const HEATMAP_IDS = ['outage'] as const;
export type HeatmapId = (typeof HEATMAP_IDS)[number];

/**
 * Kesinti/iş emri katmanlarının varsayılan durum filtresi: İPTAL EDİLENLER dışında hepsi.
 * Diğer çoklu-seçim filtreleriyle aynı ilke — varsayılan "hepsi açık", kullanıcı daraltır.
 */
const DEFAULT_OUTAGE_STATUSES: OutageStatus[] = OUTAGE_STATUSES.filter((status) => status !== 'CANCELLED');
const DEFAULT_WORK_ORDER_STATUSES: WorkOrderStatus[] = WORK_ORDER_STATUSES.filter((status) => status !== 'CANCELLED');

/** Virgülle ayrılmış bir query param'ı bilinen değerlere göre süzer. */
function parseCsv<T extends string>(raw: string | null, allowed: readonly T[], fallback: T[]): T[] {
  if (raw === null) return fallback;
  const parsed = raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
  return parsed;
}

/** `'true'`/`'false'`/yok üçlüsünü boolean'a çevirir. */
function parseTriState(raw: string | null): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

export interface MapView {
  lng: number;
  lat: number;
  zoom: number;
}

/**
 * Harita durumunu (aktif kategoriler, gerilim filtresi, bağımsız katmanlar, görünüm, seçili
 * eleman) URL query param'ında tutar — geri tuşu ve link paylaşımı bunun üzerine kurulur.
 * Kategori/gerilim listeleri boşsa "hepsi açık" varsayılan durumdur; URL'i kirletmemek için
 * varsayılan durum hiç yazılmaz.
 */
export function useMapState() {
  const [params, setParams] = useSearchParams();

  const legend = useMemo<Set<LegendId>>(() => {
    const raw = params.get('layers');
    // Varsayılan: HEPSİ açık. Ne kadarının çizileceğini efsane değil zoom belirler
    // (bkz. networkLayers.ts LEGEND_MIN_ZOOM) — kullanıcı katmanı kapatmadıkça kaybolmaz.
    // `none` sentinel'i "hepsi kapalı"yı temsil eder — boş string varsayılana düşerdi.
    if (raw === null) return new Set<LegendId>(LEGEND_IDS);
    if (raw === NO_LAYERS) return new Set<LegendId>();
    return new Set(raw.split(',').filter((v): v is LegendId => (LEGEND_IDS as readonly string[]).includes(v)));
  }, [params]);

  const voltageLevels = useMemo<Set<VoltageLevel>>(() => {
    const raw = params.get('voltage');
    // Parametre HİÇ YOKSA varsayılan (hepsi); BOŞ STRING ise kullanıcı hepsini bilerek
    // kapatmıştır — `!raw` boş string'i de "yok" sayardı ve seçim bir sonraki render'da
    // sessizce hepsine geri dönerdi.
    if (raw === null) return new Set(VOLTAGE_LEVELS);
    return new Set(raw.split(',').filter((v): v is VoltageLevel => (VOLTAGE_LEVELS as readonly string[]).includes(v)));
  }, [params]);

  const showAdminBoundaries = params.get('boundaries') !== '0';
  // Kesinti/iş emri katmanları varsayılan olarak AÇIKTIR — diğer çoklu-seçimlerle aynı
  // ilke. Isı haritası bunun dışında kalır: birden çok ısı haritası türü eklenirse bile
  // aynı anda yalnız biri anlamlıdır, o yüzden varsayılan olarak hiçbiri seçili değildir.
  const showOutages = params.get('outages') !== '0';
  const showWorkOrders = params.get('workOrders') !== '0';
  const heatmapId = params.get('heatmap') as HeatmapId | null;
  const activeHeatmap = heatmapId !== null && HEATMAP_IDS.includes(heatmapId) ? heatmapId : undefined;

  /**
   * Harita kesinti filtreleri — **mevcut `OutageFilters` arayüzünü yeniden kullanır**;
   * haritaya paralel bir filtre modeli kurulmaz.
   */
  const outageFilters = useMemo<OutageFilters>(() => {
    const minAffected = params.get('oMinCustomers');
    return {
      status: parseCsv(params.get('oStatus'), OUTAGE_STATUSES, DEFAULT_OUTAGE_STATUSES),
      origin: parseCsv(params.get('oOrigin'), ['USER', 'SYSTEM'] as const, []),
      startedAtFrom: params.get('oFrom') ?? undefined,
      startedAtTo: params.get('oTo') ?? undefined,
      durationMinMinutes: params.get('oMinDuration') ? Number(params.get('oMinDuration')) : undefined,
      durationMaxMinutes: params.get('oMaxDuration') ? Number(params.get('oMaxDuration')) : undefined,
      minAffectedCustomers: minAffected ? Number(minAffected) : undefined,
      hasWorkOrder: parseTriState(params.get('oHasWorkOrder')),
    };
  }, [params]);

  /** Harita iş emri filtreleri — mevcut `WorkOrderFilters` arayüzünden. */
  const workOrderFilters = useMemo<WorkOrderFilters>(() => {
    return {
      status: parseCsv(params.get('wStatus'), WORK_ORDER_STATUSES, DEFAULT_WORK_ORDER_STATUSES),
      type: parseCsv(params.get('wType'), WORK_ORDER_TYPES, [...WORK_ORDER_TYPES]),
      origin: parseCsv(params.get('wOrigin'), ['USER', 'SYSTEM'] as const, []),
      createdAtFrom: params.get('wFrom') ?? undefined,
      createdAtTo: params.get('wTo') ?? undefined,
      hasOutage: parseTriState(params.get('wHasOutage')),
    };
  }, [params]);
  const selectedId = params.get('selected') ?? undefined;
  const focusId = params.get('focus') ?? undefined;

  const view = useMemo<MapView>(() => {
    const lngRaw = params.get('lng');
    const latRaw = params.get('lat');
    const zoomRaw = params.get('zoom');
    // `Number(null) === 0` — parametre hiç yoksa `Number()` sessizce 0'a düşer ve
    // `Number.isFinite` bunu geçerli sanır, DEFAULT_VIEW'e hiç düşülmez. Önce varlığı kontrol edilir.
    if (lngRaw === null || latRaw === null || zoomRaw === null) return DEFAULT_VIEW;
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    const zoom = Number(zoomRaw);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom)) return { lng, lat, zoom };
    return DEFAULT_VIEW;
  }, [params]);

  const patch = useCallback(
    (next: Record<string, string | undefined>) => {
      setParams(
        (prev) => {
          const merged = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(next)) {
            if (value === undefined) merged.delete(key);
            else merged.set(key, value);
          }
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const toggleLegend = useCallback(
    (id: LegendId) => {
      const next = new Set(legend);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      patch({ layers: next.size === 0 ? NO_LAYERS : Array.from(next).join(',') });
    },
    [legend, patch],
  );

  /**
   * Bir grubun tamamını birlikte açar/kapatır (katman grubunun başlığındaki "hepsini seç"
   * kutusu). Satır satır `toggleLegend` çağırmak YANLIŞ: her çağrı aynı render'daki
   * `legend`'i (bu render'ın kapadığı bayat kopya) taban alır, bir önceki çağrının eklediği
   * kimliği görmez — döngü sonunda yalnız SON satırın etkisi kalırdı. Burada tek `Set`
   * üzerinde toplu değişip TEK `patch` çağrısıyla yazılır.
   */
  const toggleLegendGroup = useCallback(
    (ids: readonly LegendId[]) => {
      const allOn = ids.every((id) => legend.has(id));
      const next = new Set(legend);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      patch({ layers: next.size === 0 ? NO_LAYERS : Array.from(next).join(',') });
    },
    [legend, patch],
  );

  /**
   * Gerilim seçimini TEK PARÇA yazar (tekil `toggle` değil). Filtre panelindeki grup
   * "hepsini seç" kutusu bir defada birden çok seviyeyi değiştirir; her biri için ayrı
   * `toggle` çağırmak aynı render'ın bayat `voltageLevels` kopyasını taban alır ve döngü
   * sonunda yalnız SON çağrının etkisi kalırdı (bkz. `toggleLegendGroup`'taki aynı not).
   */
  const setVoltageLevels = useCallback(
    (levels: VoltageLevel[]) => {
      patch({ voltage: levels.length === VOLTAGE_LEVELS.length ? undefined : levels.join(',') });
    },
    [patch],
  );

  const setShowAdminBoundaries = useCallback((value: boolean) => patch({ boundaries: value ? undefined : '0' }), [patch]);
  const setShowOutages = useCallback((value: boolean) => patch({ outages: value ? undefined : '0' }), [patch]);
  const setShowWorkOrders = useCallback((value: boolean) => patch({ workOrders: value ? undefined : '0' }), [patch]);
  // `setShowOutages` + `setShowWorkOrders`'ı ayrı ayrı çağırmak aynı `resolveFocus`
  // notundaki tuzağa düşer: ikisi de aynı render'ın bayat `searchParams`'ını taban alır,
  // ikincisi birincisini ezer — "İşletim Kayıtları" grubunun "hepsini seç" kutusu yalnız
  // son çağrılanı (iş emirlerini) değiştirmiş gibi görünürdü. Tek `patch` çağrısıyla atomik.
  const setShowOperationsLayers = useCallback(
    (value: boolean) => patch({ outages: value ? undefined : '0', workOrders: value ? undefined : '0' }),
    [patch],
  );
  /** Isı haritaları birbirini dışlar — yeni bir tür seçmek eskisini kapatır. */
  const setActiveHeatmap = useCallback((id: HeatmapId | undefined) => patch({ heatmap: id }), [patch]);

  /** Bir kesinti filtresi alanını URL'e yazar; varsayılana dönen alan URL'den silinir. */
  const patchOutageFilters = useCallback(
    (next: Partial<OutageFilters>) => {
      const changes: Record<string, string | undefined> = {};
      if ('status' in next) changes.oStatus = (next.status ?? []).join(',');
      if ('origin' in next) changes.oOrigin = next.origin?.length ? next.origin.join(',') : undefined;
      if ('startedAtFrom' in next) changes.oFrom = next.startedAtFrom || undefined;
      if ('startedAtTo' in next) changes.oTo = next.startedAtTo || undefined;
      if ('durationMinMinutes' in next) changes.oMinDuration = next.durationMinMinutes?.toString();
      if ('durationMaxMinutes' in next) changes.oMaxDuration = next.durationMaxMinutes?.toString();
      if ('minAffectedCustomers' in next) changes.oMinCustomers = next.minAffectedCustomers?.toString();
      if ('hasWorkOrder' in next) {
        changes.oHasWorkOrder = next.hasWorkOrder === undefined ? undefined : String(next.hasWorkOrder);
      }
      patch(changes);
    },
    [patch],
  );

  /** Bir iş emri filtresi alanını URL'e yazar. */
  const patchWorkOrderFilters = useCallback(
    (next: Partial<WorkOrderFilters>) => {
      const changes: Record<string, string | undefined> = {};
      if ('status' in next) changes.wStatus = (next.status ?? []).join(',');
      if ('type' in next) changes.wType = next.type?.length ? next.type.join(',') : undefined;
      if ('origin' in next) changes.wOrigin = next.origin?.length ? next.origin.join(',') : undefined;
      if ('createdAtFrom' in next) changes.wFrom = next.createdAtFrom || undefined;
      if ('createdAtTo' in next) changes.wTo = next.createdAtTo || undefined;
      if ('hasOutage' in next) changes.wHasOutage = next.hasOutage === undefined ? undefined : String(next.hasOutage);
      patch(changes);
    },
    [patch],
  );
  const setSelectedId = useCallback((id: string | undefined) => patch({ selected: id }), [patch]);
  const clearFocus = useCallback(() => patch({ focus: undefined }), [patch]);
  // `setSelectedId` + `clearFocus`'u ayrı ayrı çağırmak, react-router'ın `setSearchParams`'ı
  // her çağrıda AYNI (o render'daki) `prev`'i taban aldığı için ikincisinin birincisini
  // ezmesine yol açar — `selected` hiç yazılmamış gibi kaybolur. Tek `patch` çağrısıyla ikisi
  // birden atomik uygulanır.
  const resolveFocus = useCallback((id: string) => patch({ selected: id, focus: undefined }), [patch]);

  const setView = useCallback(
    (next: MapView) => patch({ lng: next.lng.toFixed(5), lat: next.lat.toFixed(5), zoom: next.zoom.toFixed(2) }),
    [patch],
  );

  return {
    view,
    setView,
    legend,
    toggleLegend,
    toggleLegendGroup,
    voltageLevels,
    setVoltageLevels,
    showAdminBoundaries,
    setShowAdminBoundaries,
    showOutages,
    setShowOutages,
    showWorkOrders,
    setShowWorkOrders,
    setShowOperationsLayers,
    activeHeatmap,
    setActiveHeatmap,
    outageFilters,
    patchOutageFilters,
    workOrderFilters,
    patchWorkOrderFilters,
    selectedId,
    setSelectedId,
    focusId,
    clearFocus,
    resolveFocus,
  };
}
