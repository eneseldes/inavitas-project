import { apiFetch } from '../../shared/api/client.ts';
import type { PageResult, SortDirection } from '../../types/api.ts';
import type { CreateWorkOrderInput, WorkOrder, WorkOrderFilters, WorkOrderHistoryEntry, WorkOrderStatus } from '../../types/work-order.ts';

export interface WorkOrdersQuery {
  page: number;
  pageSize: number;
  sort: { field: string; dir: SortDirection };
  filters: WorkOrderFilters;
}

function buildQuery({ page, pageSize, sort, filters }: WorkOrdersQuery): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: `${sort.field}:${sort.dir}`,
  });

  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.origin?.length) params.set('origin', filters.origin.join(','));
  if (filters.type) params.set('type', filters.type);
  if (filters.gisId) params.set('gisId', filters.gisId);
  if (filters.createdAtFrom) params.set('createdAtFrom', filters.createdAtFrom);
  if (filters.createdAtTo) params.set('createdAtTo', filters.createdAtTo);
  if (filters.hasOutage !== undefined) params.set('hasOutage', String(filters.hasOutage));

  return params.toString();
}

export function fetchWorkOrders(query: WorkOrdersQuery): Promise<PageResult<WorkOrder>> {
  return apiFetch(`/api/work-orders?${buildQuery(query)}`);
}

export function fetchWorkOrder(id: string): Promise<WorkOrder> {
  return apiFetch(`/api/work-orders/${id}`);
}

export function createWorkOrder(input: CreateWorkOrderInput): Promise<WorkOrder> {
  return apiFetch('/api/work-orders', { method: 'POST', body: input });
}

export function patchWorkOrder(id: string, body: { status: WorkOrderStatus; version: number }): Promise<WorkOrder> {
  return apiFetch(`/api/work-orders/${id}`, { method: 'PATCH', body });
}

export function fetchWorkOrderHistory(id: string): Promise<{ items: WorkOrderHistoryEntry[] }> {
  return apiFetch(`/api/work-orders/${id}/history`);
}

