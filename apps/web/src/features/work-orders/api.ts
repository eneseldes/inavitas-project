import { apiFetch } from '../../shared/api/client.ts';
import type { PageResult, SortDirection } from '../../types/api.ts';
import type {
  CreateWorkOrderInput,
  WorkOrder,
  WorkOrderFilters,
  WorkOrderHistoryEntry,
  WorkOrderMapItem,
  WorkOrderStatus,
} from '../../types/work-order.ts';

export interface WorkOrdersQuery {
  page: number;
  pageSize: number;
  sort: { field: string; dir: SortDirection };
  filters: WorkOrderFilters;
}

/**
 * Filtreleri query string'e çevirir. Liste ve harita uçları **aynı** filtre modelini
 * kullanır (bkz. `WorkOrderFilters`) — haritaya paralel bir filtre modeli kurulmaz.
 */
function appendFilters(params: URLSearchParams, filters: WorkOrderFilters): void {
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.origin?.length) params.set('origin', filters.origin.join(','));
  if (filters.type?.length) params.set('type', filters.type.join(','));
  if (filters.cbsId) params.set('cbsId', filters.cbsId);
  if (filters.unitPath) params.set('unitPath', filters.unitPath);
  if (filters.createdAtFrom) params.set('createdAtFrom', filters.createdAtFrom);
  if (filters.createdAtTo) params.set('createdAtTo', filters.createdAtTo);
  if (filters.hasOutage !== undefined) params.set('hasOutage', String(filters.hasOutage));
}

function buildQuery({ page, pageSize, sort, filters }: WorkOrdersQuery): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: `${sort.field}:${sort.dir}`,
  });

  appendFilters(params, filters);

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

/** Harita katmanı için hafif özet — sayfalama yok, sunucuda üst sınır var. */
export function fetchWorkOrderMapItems(
  filters: WorkOrderFilters,
): Promise<{ items: WorkOrderMapItem[]; truncated: boolean }> {
  const params = new URLSearchParams();
  appendFilters(params, filters);
  const query = params.toString();
  return apiFetch(`/api/work-orders/map${query ? `?${query}` : ''}`);
}
