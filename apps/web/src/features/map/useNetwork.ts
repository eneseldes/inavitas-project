import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  fetchComponent,
  fetchEnergization,
  fetchImpactPreview,
  fetchTrace,
  fetchUnit,
  fetchUnitLabels,
  queryWithin,
  type AreaQueryBody,
  type TraceDirection,
} from './api.ts';

export const NETWORK_COMPONENT_KEY = 'network-component';
export const NETWORK_UNIT_LABELS_KEY = 'network-unit-labels';
export const NETWORK_UNIT_KEY = 'network-unit';
export const NETWORK_TRACE_KEY = 'network-trace';
export const NETWORK_IMPACT_PREVIEW_KEY = 'network-impact-preview';
export const NETWORK_AREA_QUERY_KEY = 'network-area-query';
export const NETWORK_ENERGIZATION_KEY = 'network-energization';

/** İl ve ilçe adları — harita üzerine yazılan etiketleri besler, oturum boyunca değişmez. */
export function useUnitLabels() {
  return useQuery({
    queryKey: [NETWORK_UNIT_LABELS_KEY],
    queryFn: async () => {
      const [provinces, districts] = await Promise.all([fetchUnitLabels('PROVINCE'), fetchUnitLabels('DISTRICT')]);
      return { provinces, districts };
    },
    staleTime: Infinity,
  });
}

/** Haritada tıklanan elemanın detayını getirir — sol panel özeti bunu besler. */
export function useComponent(id: string | undefined) {
  return useQuery({
    queryKey: [NETWORK_COMPONENT_KEY, id],
    queryFn: () => fetchComponent(id!),
    enabled: id !== undefined,
  });
}

/**
 * Seçili elemanın besleme zinciri (`up`) ya da etkilenenler izi (`down`).
 * Model salt-okunur işletilir — aynı elemanın izi oturum boyunca değişmez, bu yüzden
 * sonuç bayatlatılmaz; kullanıcı izi açıp kapattıkça aynı yanıt yeniden kullanılır.
 */
export function useTrace(id: string | undefined, direction: TraceDirection | undefined) {
  return useQuery({
    queryKey: [NETWORK_TRACE_KEY, id, direction],
    queryFn: () => fetchTrace(id!, direction!),
    enabled: id !== undefined && direction !== undefined,
    staleTime: Infinity,
  });
}

/**
 * Kesinti/iş emri onay adımının etki özeti — tamamen bellek-içi hesaplandığı için hızlıdır.
 *
 * **`staleTime: Infinity` olamaz.** Yanıt artık `isEnergized`, `deEnergizedBy` ve
 * `childOutages` taşıyor; üçü de anlık durumdur. Model salt-okunur ama **işletim durumu
 * değil** — kesinti/enerjilenme SSE'si geldiğinde bu sorgu tazelenmelidir.
 * (`useTrace` `Infinity` kalabilir: topoloji hâlâ değişmiyor.)
 */
/**
 * `/map?unit=<path>` derin bağının hedefi. İdari birimler değişmeyen seed verisidir; sonuç
 * oturum boyunca taze sayılır.
 */
export function useUnit(path: string | undefined) {
  return useQuery({
    queryKey: [NETWORK_UNIT_KEY, path],
    queryFn: () => fetchUnit(path!),
    enabled: path !== undefined,
    staleTime: Infinity,
  });
}

export function useImpactPreview(id: string | undefined) {
  return useQuery({
    queryKey: [NETWORK_IMPACT_PREVIEW_KEY, id],
    queryFn: () => fetchImpactPreview(id!),
    enabled: id !== undefined,
  });
}

/**
 * Enerjisiz kümenin vurgu token'ı.
 *
 * Sorgu anahtarında **kamera yok**: pan/zoom bu sorguyu hiç tetiklemez. Yalnız enerjilenme
 * SSE'si geldiğinde tazelenir ve o zaman yeni bir token döner; token değişince haritanın
 * vurgu kaynağı kendi tile'larını yeniden yükler. Eskiden bbox ~100 m'lik bir ızgaraya
 * yuvarlanıyordu ve neredeyse her `moveend` yeni bir istek açıyordu.
 */
export function useEnergization() {
  return useQuery({
    queryKey: [NETWORK_ENERGIZATION_KEY],
    queryFn: () => fetchEnergization(),
    placeholderData: keepPreviousData,
  });
}

/**
 * Çizilen alanın içindeki şebeke elemanları.
 *
 * Sayfa değişiminde önceki sonuç ekranda tutulur (`keepPreviousData`): liste her sayfada
 * boşalıp yeniden dolarsa panel titrer ve haritadaki vurgu bir an kaybolur.
 */
export function useAreaComponents(body: AreaQueryBody | undefined) {
  return useQuery({
    queryKey: [NETWORK_AREA_QUERY_KEY, body],
    queryFn: () => queryWithin(body!),
    enabled: body !== undefined,
    placeholderData: keepPreviousData,
  });
}
