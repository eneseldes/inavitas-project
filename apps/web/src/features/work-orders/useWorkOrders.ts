import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkOrder, fetchWorkOrder, fetchWorkOrderHistory, fetchWorkOrders, patchWorkOrder, type WorkOrdersQuery } from './api.ts';

const WORK_ORDERS_KEY = 'work-orders';

export function useWorkOrders(query: WorkOrdersQuery) {
  return useQuery({
    queryKey: [WORK_ORDERS_KEY, query],
    queryFn: () => fetchWorkOrders(query),
    placeholderData: keepPreviousData,
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

