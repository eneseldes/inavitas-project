import { apiFetch } from '../../shared/api/client.ts';
import type { PageResult, SortDirection } from '../../types/api.ts';
import type { CreateOutageInput, Outage, OutageFilters, OutageHistoryEntry, OutageStatus } from '../../types/outage.ts';

export interface OutagesQuery {
  page: number;
  pageSize: number;
  sort: { field: string; dir: SortDirection };
  filters: OutageFilters;
}

function buildQuery({ page, pageSize, sort, filters }: OutagesQuery): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: `${sort.field}:${sort.dir}`,
  });

  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.origin?.length) params.set('origin', filters.origin.join(','));
  if (filters.gisId) params.set('gisId', filters.gisId);
  if (filters.startedAtFrom) params.set('startedAtFrom', filters.startedAtFrom);
  if (filters.startedAtTo) params.set('startedAtTo', filters.startedAtTo);
  if (filters.createdAtFrom) params.set('createdAtFrom', filters.createdAtFrom);
  if (filters.createdAtTo) params.set('createdAtTo', filters.createdAtTo);
  if (filters.hasWorkOrder !== undefined) params.set('hasWorkOrder', String(filters.hasWorkOrder));

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

