/**
 * İş emri durum makinesi — SRS 1.6.
 *
 * Framework'ten bağımsız saf mantık (bkz. outage-service/src/domain/state-machine.ts
 * için aynı gerekçe).
 */

export const WORK_ORDER_STATUSES = ['STARTED', 'ASSIGNED', 'IN_PROGRESS', 'ENERGIZED', 'DONE', 'CANCELLED'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  STARTED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ENERGIZED', 'CANCELLED'],
  ENERGIZED: ['DONE', 'CANCELLED'],
  DONE: ['CANCELLED'],
  CANCELLED: [], // terminal durum, çıkış yok
};

export const canTransition = (from: WorkOrderStatus, to: WorkOrderStatus): boolean => TRANSITIONS[from].includes(to);
