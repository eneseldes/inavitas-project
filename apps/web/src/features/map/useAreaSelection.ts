import { useCallback, useMemo, useState } from 'react';
import type { Polygon } from 'geojson';
import type { VoltageLevel } from '../../types/network.ts';
import type { OutageMapItem } from '../../types/outage.ts';
import type { WorkOrderMapItem } from '../../types/work-order.ts';
import { isPointInPolygon } from './polygonDraw.ts';
import { useAreaComponents } from './useNetwork.ts';

/**
 * Poligon **URL'e yazılmaz** — harita durumunun geri kalanı (görünüm, katmanlar, filtreler)
 * query param'ında tutulsa da bir poligonun koordinat listesi URL'e sığmaz; istemci
 * state'inde kalır ve sayfa yenilenince düşer.
 */

const DEFAULT_PAGE_SIZE = 25;

export type AreaSelectionState = ReturnType<typeof useAreaSelectionState>;

/** Seçimin kendisi: çizilen poligon ve sayfalama. Hiçbir sorgu içermez. */
export function useAreaSelectionState() {
  const [polygon, setPolygon] = useState<Polygon | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  /** Poligon değişince sayfa başa döner — eski sayfa numarası yeni sonuçta anlamsızdır. */
  const applyPolygon = useCallback((next: Polygon | null) => {
    setPolygon(next);
    setPage(1);
  }, []);

  return {
    polygon,
    applyPolygon,
    page,
    setPage,
    pageSize,
    setPageSize,
  };
}

interface AreaResultsInput {
  state: AreaSelectionState;
  /** Harita katmanını besleyen kayıtlar — alan süzmesi bunların üzerinde yapılır. */
  outages: OutageMapItem[] | undefined;
  workOrders: WorkOrderMapItem[] | undefined;
  /** Sağ paneldeki gerilim çapraz filtresi; alan sorgusu da aynı filtreyi kullanır. */
  voltageLevels: Set<VoltageLevel>;
  /** Katmanlar panelindeki görünürlük — alanın içinde ne aranacağı ayrı bir seçim değil,
   * bu iki anahtarın o anki durumudur (bkz. AreaSelectPanel.tsx). */
  includeOutages: boolean;
  includeWorkOrders: boolean;
}

/** Seçimin sonuçları: sunucudan gelen elemanlar + istemcide süzülen kayıtlar. */
export function useAreaResults({ state, outages, workOrders, voltageLevels, includeOutages, includeWorkOrders }: AreaResultsInput) {
  const { polygon, page, pageSize } = state;

  const body = useMemo(() => {
    if (!polygon) return undefined;
    // Kategori filtresi yok — alan panelinde ayrı bir arama kapsamı seçilmez, elemanların
    // tamamı aranır (gerilim filtresi hâlâ Filtreler panelinden gelir).
    return {
      polygon,
      voltageLevel: Array.from(voltageLevels),
      page,
      pageSize,
    };
  }, [polygon, voltageLevels, page, pageSize]);

  const componentQuery = useAreaComponents(body);

  // Kesinti ve iş emirleri sunucuya ikinci kez sorulmaz: harita katmanı için zaten
  // istemcide duruyorlar (kendi filtreleriyle, sunucudaki üst sınıra kadar). Şebeke
  // elemanları içinse 593 bin satır asla istemciye inmez, o sorgu sunucuda çalışır.
  const outagesInArea = useMemo(() => {
    if (!polygon || !includeOutages) return [];
    return (outages ?? []).filter((item) => isPointInPolygon(item.lon, item.lat, polygon));
  }, [polygon, includeOutages, outages]);

  const workOrdersInArea = useMemo(() => {
    if (!polygon || !includeWorkOrders) return [];
    return (workOrders ?? []).filter((item) => isPointInPolygon(item.lon, item.lat, polygon));
  }, [polygon, includeWorkOrders, workOrders]);

  const counts = polygon
    ? {
        components: componentQuery.data?.total ?? 0,
        outages: outagesInArea.length,
        workOrders: workOrdersInArea.length,
      }
    : undefined;

  return {
    components: componentQuery.data,
    isLoading: componentQuery.isLoading,
    isFetching: componentQuery.isFetching,
    refetch: componentQuery.refetch,
    outagesInArea,
    workOrdersInArea,
    counts,
  };
}
