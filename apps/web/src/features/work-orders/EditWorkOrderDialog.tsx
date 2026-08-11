import { useState } from 'react';
import { ApiError } from '../../shared/api/errors.ts';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { WorkOrder, WorkOrderStatus } from '../../types/work-order.ts';
import { NEXT_STATUSES } from './columns.tsx';
import styles from './EditWorkOrderDialog.module.scss';
import { usePatchWorkOrder } from './useWorkOrders.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

interface EditWorkOrderDialogProps {
  workOrder: WorkOrder;
  onClose: () => void;
}

/**
 * İş emri güncelleme penceresi.
 *
 * Güncelleme servisi yalnızca durum bilgisini kabul eder; bu pencere kaydın
 * diğer detaylarını da görüntüleyerek bilinçli durum değişikliği yapılmasını sağlar.
 */
export function EditWorkOrderDialog({ workOrder, onClose }: EditWorkOrderDialogProps) {
  const patchWorkOrder = usePatchWorkOrder();
  const { show } = useToast();
  const { t } = useTranslation();
  const labels = useLabels();
  const [nextStatus, setNextStatus] = useState<WorkOrderStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const options = NEXT_STATUSES[workOrder.status];

  const onSubmit = async () => {
    if (!nextStatus) return;

    setSubmitting(true);
    setError(null);
    try {
      await patchWorkOrder.mutateAsync({ id: workOrder.id, status: nextStatus, version: workOrder.version });
      show('success', t('work-order.toast.statusChanged', { status: labels.workOrderStatus(nextStatus) }));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t('work-order.toast.updateError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t('work-order.dialog.edit.title')} onClose={onClose}>
      <div className={styles.readOnlyBlock}>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>ID</span>
          <span className={`${styles.readOnlyValue} font-mono`} title={workOrder.id}>
            {workOrder.id.slice(0, 8)}
          </span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>GIS ID</span>
          <span className={`${styles.readOnlyValue} font-mono`}>{workOrder.gisId}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>{t('work-order.dialog.edit.typeLabel')}</span>
          <span className={styles.readOnlyValue}>{labels.workOrderType(workOrder.type)}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>{t('work-order.dialog.edit.originLabel')}</span>
          <span className={styles.readOnlyValue}>{labels.origin(workOrder.origin)}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>{t('work-order.dialog.edit.createdAtLabel')}</span>
          <span className={styles.readOnlyValue}>{dateFormatter.format(new Date(workOrder.createdAt))}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>{t('work-order.dialog.edit.currentStatusLabel')}</span>
          <StatusBadge status={workOrder.status} />
        </div>
      </div>

      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="nextStatus" className="field__label">
          {t('work-order.dialog.edit.nextStatusLabel')}
        </label>
        {options.length > 0 ? (
          <select id="nextStatus" className="select" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as WorkOrderStatus)}>
            <option value="" disabled>
              {t('work-order.dialog.edit.selectTransition')}
            </option>
            {options.map((status) => (
              <option key={status} value={status}>
                {labels.workOrderStatus(status)}
              </option>
            ))}
          </select>
        ) : (
          <p className="field__hint">{t('work-order.dialog.edit.noTransitions')}</p>
        )}
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn btn--ghost">
          {t('common.action.cancel')}
        </button>
        <button type="button" onClick={onSubmit} disabled={!nextStatus || isSubmitting} className="btn btn--primary">
          {isSubmitting ? t('common.action.saving') : t('common.action.save')}
        </button>
      </div>
    </Modal>
  );
}
