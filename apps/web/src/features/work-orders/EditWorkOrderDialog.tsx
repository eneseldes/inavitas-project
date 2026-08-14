import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { SelectField } from '../../shared/components/form';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { WorkOrder, WorkOrderStatus } from '../../types/work-order.ts';
import { NEXT_STATUSES } from './columns.tsx';
import styles from './EditWorkOrderDialog.module.scss';
import { usePatchWorkOrder } from './useWorkOrders.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function useEditWorkOrderSchema(requiredMessage: string) {
  return z.object({
    nextStatus: z.string().min(1, requiredMessage),
  });
}

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
  const options = NEXT_STATUSES[workOrder.status];
  const schema = useEditWorkOrderSchema(t('work-order.dialog.edit.selectTransition'));

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { nextStatus: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const nextStatus = values.nextStatus as WorkOrderStatus;
      await patchWorkOrder.mutateAsync({ id: workOrder.id, status: nextStatus, version: workOrder.version });
      show('success', t('work-order.toast.statusChanged', { status: labels.workOrderStatus(nextStatus) }));
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('work-order.toast.updateError') });
    }
  });

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

      {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

      {options.length > 0 ? (
        <form onSubmit={onSubmit} noValidate>
          <SelectField label={t('work-order.dialog.edit.nextStatusLabel')} error={errors.nextStatus?.message} {...register('nextStatus')}>
            <option value="">{t('work-order.dialog.edit.selectTransition')}</option>
            {options.map((status) => (
              <option key={status} value={status}>
                {labels.workOrderStatus(status)}
              </option>
            ))}
          </SelectField>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn btn--ghost">
              {t('common.action.cancel')}
            </button>
            <button type="submit" disabled={isSubmitting || !isDirty} className="btn btn--primary">
              {isSubmitting ? t('common.action.saving') : t('common.action.save')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="field">
            <span className="field__label">{t('work-order.dialog.edit.nextStatusLabel')}</span>
            <p className="field__hint">{t('work-order.dialog.edit.noTransitions')}</p>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn btn--ghost">
              {t('common.action.cancel')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
