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
    // `createdBy`/`actor` gibi alanlar normalde bir kullanıcının e-postasını taşır; sistemin
    // kendisi bir olayı tetiklediğinde ise `SYSTEM_ACTOR` sabiti (bkz. @inavitas/contracts)
    // düz metin "SYSTEM" yazar. Yalnız o tek değeri çevirir, gerçek e-postalara dokunmaz.
    actor: (value: string) => (value === 'SYSTEM' ? t('common.enum.origin.SYSTEM') : value),
    roles: (r?: string[]) => (r?.length ? r.map((x) => t(`common.enum.role.${x}`)).join(', ') : ''),
    // Sistem rolleri sabit bir enum'dur (ADMIN/OUTAGE_OPERATOR/WORK_ORDER_OPERATOR) ve
    // çeviri anahtarı üzerinden gösterilir; özel (admin tarafından yazılan) roller
    // serbest metin olduğundan olduğu gibi gösterilir.
    roleName: (role: { code: string; name: string; isSystem: boolean }) =>
      role.isSystem ? t(`common.enum.role.${role.code}`, undefined, role.name) : role.name,
  };
}
