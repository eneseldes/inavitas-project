/** Geçerli iş emri durumları listesi. */
export const WORK_ORDER_STATUSES = ['STARTED', 'ASSIGNED', 'IN_PROGRESS', 'ENERGIZED', 'DONE', 'CANCELLED'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/** Geçerli iş emri türleri listesi. */
export const WORK_ORDER_TYPES = [
  'BASIC_WORK',
  'LIGHTING_WORK_ORDER',
  'PLANNED_OUTAGE_WORK_ORDER',
  'UNPLANNED_OUTAGE_WORK_ORDER',
  'WITHOUT_OUTAGE_WORK_ORDER',
] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

export interface WorkOrder {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: WorkOrderStatus;
  type: WorkOrderType;
  gisId: string;
  outageId: string | null;
  origin: 'USER' | 'SYSTEM';
  createdBy: string;
  version: number;
}

export interface WorkOrderFilters {
  status?: WorkOrderStatus[];
  type?: WorkOrderType;
  gisId?: string;
  hasOutage?: boolean;
}

export interface CreateWorkOrderInput {
  gisId: string;
  type: WorkOrderType;
}

export interface WorkOrderHistoryEntry {
  id: string;
  changedAt: string;
  fromStatus: WorkOrderStatus | null;
  toStatus: WorkOrderStatus;
  actor: string;
  origin: 'USER' | 'SYSTEM';
}

