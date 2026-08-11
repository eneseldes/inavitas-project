import { clsx } from 'clsx';
import { useLabels } from '../../features/i18n/useLabels.ts';
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

// Kesinti ve iş emri durum enum'ları `STARTED`/`ENERGIZED`/`CANCELLED` değerlerini
// paylaşır — hangi etiket setine ait olduğu çağıranın tipiyle belli olduğundan
// iki useLabels çözümleyicisi de aynı duruma bakılınca aynı sonucu üretir.
function isWorkOrderOnlyStatus(status: OutageStatus | WorkOrderStatus): status is 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' {
  return status === 'ASSIGNED' || status === 'IN_PROGRESS' || status === 'DONE';
}

export function StatusBadge({ status }: { status: OutageStatus | WorkOrderStatus }) {
  const labels = useLabels();
  const text = isWorkOrderOnlyStatus(status) ? labels.workOrderStatus(status) : labels.outageStatus(status as OutageStatus);

  return <span className={clsx('badge', COLORS[status])}>{text}</span>;
}
