import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkOrderFilters } from '../../types/work-order.ts';
import {
  createWorkOrder,
  fetchWorkOrder,
  fetchWorkOrderHistory,
  fetchWorkOrderMapItems,
  fetchWorkOrders,
  patchWorkOrder,
  type WorkOrdersQuery,
} from './api.ts';

export const WORK_ORDERS_KEY = 'work-orders';

export function useWorkOrders(query: WorkOrdersQuery, enabled = true) {
  return useQuery({
    queryKey: [WORK_ORDERS_KEY, query],
    queryFn: () => fetchWorkOrders(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useWorkOrder(id: string | undefined) {
  return useQuery({
    queryKey: [WORK_ORDERS_KEY, 'detail', id],
    queryFn: () => fetchWorkOrder(id!),
    enabled: id !== undefined,
  });
}

export function useWorkOrderHistory(id: string | undefined) {
  return useQuery({
    queryKey: [WORK_ORDERS_KEY, 'history', id],
    queryFn: () => fetchWorkOrderHistory(id!),
    enabled: id !== undefined,
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] }),
  });
}

export function usePatchWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Parameters<typeof patchWorkOrder>[1] & { id: string }) => patchWorkOrder(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] }),
  });
}


/** Harita katmanı verisi — SSE geldiğinde `WORK_ORDERS_KEY` invalidate edildiği için tazelenir. */
export function useWorkOrderMapItems(filters: WorkOrderFilters, enabled: boolean) {
  return useQuery({
    queryKey: [WORK_ORDERS_KEY, 'map', filters],
    queryFn: () => fetchWorkOrderMapItems(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}
