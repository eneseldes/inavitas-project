import { useQuery } from '@tanstack/react-query';
import { fetchComponent } from './api.ts';

export const NETWORK_COMPONENT_KEY = 'network-component';

/** Haritada tıklanan elemanın detayını getirir — sol panel özeti bunu besler. */
export function useComponent(id: string | undefined) {
  return useQuery({
    queryKey: [NETWORK_COMPONENT_KEY, id],
    queryFn: () => fetchComponent(id!),
    enabled: id !== undefined,
  });
}
