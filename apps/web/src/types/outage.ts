/** outage-service/src/domain/state-machine.ts ile birebir aynı liste — SRS 1.6. */
export const OUTAGE_STATUSES = ['STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED'] as const;
export type OutageStatus = (typeof OUTAGE_STATUSES)[number];

export interface Outage {
  id: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  status: OutageStatus;
  workOrderId: string | null;
  gisId: string;
  origin: 'USER' | 'SYSTEM';
  createdBy: string;
  version: number;
}

export interface OutageFilters {
  status?: OutageStatus[];
  gisId?: string;
  startedAtFrom?: string;
  startedAtTo?: string;
  hasWorkOrder?: boolean;
}

export interface CreateOutageInput {
  gisId: string;
  startedAt: string;
  endedAt?: string;
}

export interface OutageHistoryEntry {
  id: string;
  changedAt: string;
  fromStatus: OutageStatus | null;
  toStatus: OutageStatus;
  actor: string;
  origin: 'USER' | 'SYSTEM';
}

