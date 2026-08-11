import type { OutageStatus } from '../../types/outage.ts';
import type { WorkOrderStatus, WorkOrderType } from '../../types/work-order.ts';
import { useTranslation } from './I18nProvider.tsx';

/** Enum → görünen metin çözümleyicileri. Eski `labels.ts` haritalarının yerini alır. */
export function useLabels() {
  const { t } = useTranslation();
  return {
    outageStatus: (s: OutageStatus) => t(`outage.enum.status.${s}`),
    workOrderStatus: (s: WorkOrderStatus) => t(`work-order.enum.status.${s}`),
    workOrderType: (ty: WorkOrderType) => t(`work-order.enum.type.${ty}`),
    origin: (o: 'USER' | 'SYSTEM') => t(`common.enum.origin.${o}`),
    roles: (r?: string[]) => (r?.length ? r.map((x) => t(`common.enum.role.${x}`)).join(', ') : ''),
  };
}
