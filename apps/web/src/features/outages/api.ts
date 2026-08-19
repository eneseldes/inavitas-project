import { apiFetch } from '../../shared/api/client.ts';
import type { PageResult, SortDirection } from '../../types/api.ts';
import type {
  CreateOutageInput,
  Outage,
  OutageAffectedCustomer,
  OutageFilters,
  OutageHistoryEntry,
  OutageImpact,
  OutageImpactStatus,
  OutageMapItem,
  OutageStatus,
} from '../../types/outage.ts';

export interface OutagesQuery {
  page: number;
  pageSize: number;
  sort: { field: string; dir: SortDirection };
  filters: OutageFilters;
}

/**
 * Filtreleri query string'e çevirir. Liste ve harita uçları **aynı** filtre modelini
 * kullanır (bkz. `OutageFilters`) — haritaya paralel bir filtre modeli kurulmaz.
 */
function appendFilters(params: URLSearchParams, filters: OutageFilters): void {
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.origin?.length) params.set('origin', filters.origin.join(','));
  if (filters.componentType?.length) params.set('componentType', filters.componentType.join(','));
  if (filters.cbsId) params.set('cbsId', filters.cbsId);
  if (filters.unitPath) params.set('unitPath', filters.unitPath);
  if (filters.startedAtFrom) params.set('startedAtFrom', filters.startedAtFrom);
  if (filters.startedAtTo) params.set('startedAtTo', filters.startedAtTo);
  if (filters.createdAtFrom) params.set('createdAtFrom', filters.createdAtFrom);
  if (filters.createdAtTo) params.set('createdAtTo', filters.createdAtTo);
  if (filters.endedAtFrom) params.set('endedAtFrom', filters.endedAtFrom);
  if (filters.endedAtTo) params.set('endedAtTo', filters.endedAtTo);
  if (filters.durationMinMinutes !== undefined) params.set('durationMinMinutes', String(filters.durationMinMinutes));
  if (filters.durationMaxMinutes !== undefined) params.set('durationMaxMinutes', String(filters.durationMaxMinutes));
  if (filters.minAffectedCustomers !== undefined) {
    params.set('minAffectedCustomers', String(filters.minAffectedCustomers));
  }
  if (filters.maxAffectedCustomers !== undefined) {
    params.set('maxAffectedCustomers', String(filters.maxAffectedCustomers));
  }
  if (filters.hasWorkOrder !== undefined) params.set('hasWorkOrder', String(filters.hasWorkOrder));
}

function buildQuery({ page, pageSize, sort, filters }: OutagesQuery): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: `${sort.field}:${sort.dir}`,
  });

  appendFilters(params, filters);

  return params.toString();
}

export function fetchOutages(query: OutagesQuery): Promise<PageResult<Outage>> {
  return apiFetch(`/api/outages?${buildQuery(query)}`);
}

export function fetchOutage(id: string): Promise<Outage> {
  return apiFetch(`/api/outages/${id}`);
}

export function createOutage(input: CreateOutageInput): Promise<Outage> {
  return apiFetch('/api/outages', { method: 'POST', body: input });
}

export function patchOutage(id: string, body: { status?: OutageStatus; endedAt?: string; version: number }): Promise<Outage> {
  return apiFetch(`/api/outages/${id}`, { method: 'PATCH', body });
}

export function fetchOutageHistory(id: string): Promise<{ items: OutageHistoryEntry[] }> {
  return apiFetch(`/api/outages/${id}/history`);
}

/** Etki hesabı henüz dönmediyse `impact` `null`'dır ve `impactStatus` `PENDING` kalır. */
export function fetchOutageImpact(id: string): Promise<{ impactStatus: OutageImpactStatus; impact: OutageImpact | null }> {
  return apiFetch(`/api/outages/${id}/impact`);
}

/** Etkilenen aboneler — sayfalı ve **PII'sız**. */
export function fetchOutageAffectedCustomers(
  id: string,
  page: number,
  pageSize: number,
): Promise<PageResult<OutageAffectedCustomer>> {
  return apiFetch(`/api/outages/${id}/affected-customers?page=${page}&pageSize=${pageSize}`);
}

/** Harita katmanı için hafif özet — sayfalama yok, sunucuda üst sınır var. */
export function fetchOutageMapItems(filters: OutageFilters): Promise<{ items: OutageMapItem[]; truncated: boolean }> {
  const params = new URLSearchParams();
  appendFilters(params, filters);
  const query = params.toString();
  return apiFetch(`/api/outages/map${query ? `?${query}` : ''}`);
}
