import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { ApiError } from '../../shared/api/errors.ts';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { WORK_ORDER_TYPES } from '../../types/work-order.ts';
import { useCreateWorkOrder } from './useWorkOrders.ts';

function useCreateWorkOrderSchema() {
  const { t } = useTranslation();
  return z.object({
    gisId: z.string().min(1, t('work-order.validation.gisIdRequired')).max(64),
    type: z.enum(WORK_ORDER_TYPES),
  });
}

export function CreateWorkOrderDialog({ onClose }: { onClose: () => void }) {
  const createWorkOrder = useCreateWorkOrder();
  const { show } = useToast();
  const { t } = useTranslation();
  const labels = useLabels();
  const schema = useCreateWorkOrderSchema();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'BASIC_WORK' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createWorkOrder.mutateAsync(values);
      show('success', t('work-order.toast.createSuccess'));
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('work-order.toast.createError') });
    }
  });

  return (
    <Modal title={t('work-order.dialog.create.title')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <div className="field">
          <label htmlFor="gisId" className="field__label">
            {t('work-order.dialog.create.gisIdLabel')}
          </label>
          <input id="gisId" placeholder="CB-1024" className="input" {...register('gisId')} />
          {errors.gisId && <p className="field__error">{errors.gisId.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="type" className="field__label">
            {t('work-order.dialog.create.typeLabel')}
          </label>
          <select id="type" className="select" {...register('type')}>
            {WORK_ORDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.workOrderType(type)}
              </option>
            ))}
          </select>
          {errors.type && <p className="field__error">{errors.type.message}</p>}
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn--primary">
            {isSubmitting ? t('common.action.creating') : t('common.action.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
