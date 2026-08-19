import { useQuery } from '@tanstack/react-query';
import { fetchComponent, fetchImpactPreview, fetchTrace, fetchUnitLabels, type TraceDirection } from './api.ts';

export const NETWORK_COMPONENT_KEY = 'network-component';
export const NETWORK_UNIT_LABELS_KEY = 'network-unit-labels';
export const NETWORK_TRACE_KEY = 'network-trace';
export const NETWORK_IMPACT_PREVIEW_KEY = 'network-impact-preview';

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

/** Kesinti/iş emri onay adımının etki özeti — tamamen bellek-içi hesaplandığı için hızlıdır. */
export function useImpactPreview(id: string | undefined) {
  return useQuery({
    queryKey: [NETWORK_IMPACT_PREVIEW_KEY, id],
    queryFn: () => fetchImpactPreview(id!),
    enabled: id !== undefined,
    staleTime: Infinity,
  });
}
