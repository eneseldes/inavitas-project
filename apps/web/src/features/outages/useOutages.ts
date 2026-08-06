import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createOutage, fetchOutage, fetchOutages, patchOutage, type OutagesQuery } from './api.ts';

const OUTAGES_KEY = 'outages';

/**
 * `placeholderData: keepPreviousData` — sayfa değişiminde tablo boşalmasın
 * (03-YOL-HARITASI Faz 3 adım 6). TanStack Query v5'te `keepPreviousData`
 * eski `keepPreviousData: true` seçeneğinin yerini alan `placeholderData`
 * yardımcı fonksiyonudur.
 */
export function useOutages(query: OutagesQuery) {
  return useQuery({
    queryKey: [OUTAGES_KEY, query],
    queryFn: () => fetchOutages(query),
    placeholderData: keepPreviousData,
  });
}

export function useOutage(id: string | undefined) {
  return useQuery({
    queryKey: [OUTAGES_KEY, 'detail', id],
    queryFn: () => fetchOutage(id!),
    enabled: id !== undefined,
  });
}

export function useCreateOutage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOutage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OUTAGES_KEY] }),
  });
}

export function usePatchOutage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Parameters<typeof patchOutage>[1] & { id: string }) => patchOutage(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OUTAGES_KEY] }),
  });
}
