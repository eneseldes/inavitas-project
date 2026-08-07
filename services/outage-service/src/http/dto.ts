import { computeDurationMinutes } from '../domain/rules.ts';
import type { OutageRow, OutageStatusHistoryRow } from '../repository/outage.repository.ts';

/** DB satırını API response şekline çevirir; `durationMinutes` türetilmiş alan (SRS 1.5). */
export function toOutageDto(row: OutageRow) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationMinutes: computeDurationMinutes(row.startedAt, row.endedAt),
    status: row.status,
    workOrderId: row.workOrderId,
    gisId: row.gisId,
    origin: row.origin,
    createdBy: row.createdBy,
    version: row.version,
  };
}

export function toOutageHistoryDto(row: OutageStatusHistoryRow) {
  return {
    id: row.id,
    changedAt: row.changedAt.toISOString(),
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actor: row.actor,
    origin: row.origin,
  };
}

