import { clsx } from 'clsx';
import { OUTAGE_STATUS_LABELS, WORK_ORDER_STATUS_LABELS } from '../labels.ts';
import type { OutageStatus } from '../../types/outage.ts';
import type { WorkOrderStatus } from '../../types/work-order.ts';

/** Kayıt durumuna karşılık gelen renk sınıfı eşlemesi. */
const COLORS: Record<OutageStatus | WorkOrderStatus, string> = {
  STARTED: 'badge--gray',
  ASSIGNED: 'badge--blue',
  IN_PROGRESS: 'badge--blue',
  ENERGIZED: 'badge--cyan',
  ARCHIVED: 'badge--green',
  DONE: 'badge--green',
  CANCELLED: 'badge--red',
};

const LABELS: Record<OutageStatus | WorkOrderStatus, string> = {
  ...OUTAGE_STATUS_LABELS,
  ...WORK_ORDER_STATUS_LABELS,
};

export function StatusBadge({ status }: { status: OutageStatus | WorkOrderStatus }) {
  return <span className={clsx('badge', COLORS[status])}>{LABELS[status]}</span>;
}
