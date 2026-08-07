/**
 * İş emri durum makinesi ve durum geçiş kuralları.
 */

export const WORK_ORDER_STATUSES = ['STARTED', 'ASSIGNED', 'IN_PROGRESS', 'ENERGIZED', 'DONE', 'CANCELLED'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  STARTED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ENERGIZED', 'CANCELLED'],
  ENERGIZED: ['DONE', 'CANCELLED'],
  DONE: ['CANCELLED'],
  CANCELLED: [],
};

/** Mevcut durumdan hedef duruma geçişin geçerli olup olmadığını kontrol eder. */
export const canTransition = (from: WorkOrderStatus, to: WorkOrderStatus): boolean => TRANSITIONS[from].includes(to);
