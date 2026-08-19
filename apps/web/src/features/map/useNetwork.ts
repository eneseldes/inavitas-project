import { useQuery } from '@tanstack/react-query';
import { fetchComponent, fetchUnitLabels } from './api.ts';

export const NETWORK_COMPONENT_KEY = 'network-component';
export const NETWORK_UNIT_LABELS_KEY = 'network-unit-labels';

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
