import { useState } from 'react';
import { ApiError } from '../../shared/api/errors.ts';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { ORIGIN_LABELS, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS } from '../../shared/labels.ts';
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
 * İş emri güncelleme modalı — İşlemler sütunundaki kalem ikonuyla açılır.
 *
 * Backend PATCH /work-orders/:id yalnızca `status` kabul ediyor (bkz.
 * work-order-service/src/http/schemas.ts PatchWorkOrderBody — gisId/type
 * patchlenemez). Bu yüzden modal, sütundaki hızlı geçiş select'iyle AYNI
 * işlemi yapıyor ama kaydın tüm bağlamını (tip, kaynak, oluşturulma) göstererek
 * — hızlı tek tık yerine bilinçli/bağlamlı bir değişiklik için.
 */
export function EditWorkOrderDialog({ workOrder, onClose }: EditWorkOrderDialogProps) {
  const patchWorkOrder = usePatchWorkOrder();
  const { show } = useToast();
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
      show('success', `İş emri ${WORK_ORDER_STATUS_LABELS[nextStatus]} durumuna geçti`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İş emri güncellenemedi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="İş Emrini Güncelle" onClose={onClose}>
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
          <span className={styles.readOnlyLabel}>Tip</span>
          <span className={styles.readOnlyValue}>{WORK_ORDER_TYPE_LABELS[workOrder.type]}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>Kaynak</span>
          <span className={styles.readOnlyValue}>{ORIGIN_LABELS[workOrder.origin]}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>Oluşturulma</span>
          <span className={styles.readOnlyValue}>{dateFormatter.format(new Date(workOrder.createdAt))}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>Mevcut durum</span>
          <StatusBadge status={workOrder.status} />
        </div>
      </div>

      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="nextStatus" className="field__label">
          Yeni durum
        </label>
        {options.length > 0 ? (
          <select id="nextStatus" className="select" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as WorkOrderStatus)}>
            <option value="" disabled>
              Geçiş seç…
            </option>
            {options.map((status) => (
              <option key={status} value={status}>
                {WORK_ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        ) : (
          <p className="field__hint">Bu durumdan başka bir duruma geçiş yok.</p>
        )}
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn btn--ghost">
          Vazgeç
        </button>
        <button type="button" onClick={onSubmit} disabled={!nextStatus || isSubmitting} className="btn btn--primary">
          {isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </Modal>
  );
}
