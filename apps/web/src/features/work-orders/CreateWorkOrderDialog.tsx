import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { gateBlockMessageKey, toCreateErrorMessage } from '../map/operationErrors.ts';
import { useOperationGuards } from '../map/useOperationGuards.ts';
import { useDebounce } from '../../shared/hooks/useDebounce.ts';
import { SelectField, TextField } from '../../shared/components/form';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { WORK_ORDER_TYPES } from '../../types/work-order.ts';
import { useCreateWorkOrder } from './useWorkOrders.ts';

function useCreateWorkOrderSchema() {
  const { t } = useTranslation();
  return z.object({
    cbsId: z.string().min(1, t('work-order.validation.cbsIdRequired')).max(64),
    type: z.enum(WORK_ORDER_TYPES),
  });
}

/** Kapı sorgusu, kullanıcı yazmayı bıraktıktan bu kadar sonra çalışır. */
const GUARD_DEBOUNCE_MS = 400;

interface CreateWorkOrderDialogProps {
  onClose: () => void;
  /** Haritadan açıldığında hedef eleman zaten seçilidir; alan dolu ve **kilitli** gelir. */
  presetCbsId?: string;
}

export function CreateWorkOrderDialog({ onClose, presetCbsId }: CreateWorkOrderDialogProps) {
  const createWorkOrder = useCreateWorkOrder();
  const { show } = useToast();
  const { t } = useTranslation();
  const labels = useLabels();
  const schema = useCreateWorkOrderSchema();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { type: 'BASIC_WORK', ...(presetCbsId ? { cbsId: presetCbsId } : {}) },
  });

  // CBS ID yazıldıkça kapı çalışır. İş emri **enerjisizlik nedeniyle engellenmez** — enerjisi
  // kesik elemana iş emri açmak zaten onarımın kendisidir; engel yalnız "zaten aktif iş emri
  // var" durumudur.
  // Debounce şart: her tuş vuruşunda etki önizlemesi sunucuda bir graf gezinmesi demektir.
  const cbsId = watch('cbsId');
  const debouncedCbsId = useDebounce(cbsId, GUARD_DEBOUNCE_MS);
  const guards = useOperationGuards(debouncedCbsId && debouncedCbsId.length > 0 ? debouncedCbsId : undefined);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createWorkOrder.mutateAsync(values);
      show('success', t('work-order.toast.createSuccess'));
      onClose();
    } catch (err) {
      setError('root', { message: toCreateErrorMessage(err, 'workOrder', t) });
    }
  });

  return (
    <Modal title={t('work-order.dialog.create.title')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <TextField
          label={t('work-order.dialog.create.cbsIdLabel')}
          error={errors.cbsId?.message}
          readOnly={presetCbsId !== undefined}
          {...register('cbsId')}
        />

        <SelectField label={t('work-order.dialog.create.typeLabel')} error={errors.type?.message} {...register('type')}>
          {WORK_ORDER_TYPES.map((type) => (
            <option key={type} value={type}>
              {labels.workOrderType(type)}
            </option>
          ))}
        </SelectField>

        {guards.workOrderBlocked && (
          <div className="form-error-banner">{t(gateBlockMessageKey('workOrder', guards))}</div>
        )}

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button type="submit" disabled={isSubmitting || guards.workOrderBlocked} className="btn btn--primary">
            {isSubmitting ? t('common.action.creating') : t('common.action.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
