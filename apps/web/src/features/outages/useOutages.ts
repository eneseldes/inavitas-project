import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OutageFilters } from '../../types/outage.ts';
import {
  createOutage,
  fetchOutage,
  fetchOutageAffectedCustomers,
  fetchOutageHistory,
  fetchOutageImpact,
  fetchOutageMapItems,
  fetchOutages,
  patchOutage,
  type OutagesQuery,
} from './api.ts';

export const OUTAGES_KEY = 'outages';

/**
 * Kesinti listesini getiren veri çekme kancası (hook).
 * Sayfa ve filtre değişimlerinde görsel sıçramaları önlemek için `placeholderData: keepPreviousData` kullanılır.
 */
export function useOutages(query: OutagesQuery, enabled = true) {
  return useQuery({
    queryKey: [OUTAGES_KEY, query],
    queryFn: () => fetchOutages(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOutage(id: string | undefined) {
  return useQuery({
    queryKey: [OUTAGES_KEY, 'detail', id],
    queryFn: () => fetchOutage(id!),
    enabled: id !== undefined,
  });
}

export function useOutageHistory(id: string | undefined) {
  return useQuery({
    queryKey: [OUTAGES_KEY, 'history', id],
    queryFn: () => fetchOutageHistory(id!),
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


/**
 * Etki hesabı — kesinti açıldıktan sonra olay akışıyla (Kafka → outbox → consumer) dolduğu
 * için ilk istekte `PENDING` dönebilir. Hesap tamamlanana kadar kısa aralıklarla yeniden
 * sorulur; SSE'yi beklemek yerine burada yoklamak yeterli, çünkü bekleyen tek bir kayıt var.
 */
export function useOutageImpact(id: string | undefined) {
  return useQuery({
    queryKey: [OUTAGES_KEY, 'impact', id],
    queryFn: () => fetchOutageImpact(id!),
    enabled: id !== undefined,
    refetchInterval: (query) => (query.state.data?.impactStatus === 'PENDING' ? 1_000 : false),
  });
}

/** Kesintinin etkilediği aboneler — sayfalı, PII'sız. */
export function useOutageAffectedCustomers(id: string | undefined, page: number, pageSize: number) {
  return useQuery({
    queryKey: [OUTAGES_KEY, 'affected-customers', id, page, pageSize],
    queryFn: () => fetchOutageAffectedCustomers(id!, page, pageSize),
    enabled: id !== undefined,
    placeholderData: keepPreviousData,
  });
}

/** Harita katmanı verisi — SSE geldiğinde `OUTAGES_KEY` invalidate edildiği için tazelenir. */
export function useOutageMapItems(filters: OutageFilters, enabled: boolean) {
  return useQuery({
    queryKey: [OUTAGES_KEY, 'map', filters],
    queryFn: () => fetchOutageMapItems(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}
