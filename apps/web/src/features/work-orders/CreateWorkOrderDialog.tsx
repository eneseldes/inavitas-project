import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { ApiError } from '../../shared/api/errors.ts';
import { WORK_ORDER_TYPE_LABELS } from '../../shared/labels.ts';
import { WORK_ORDER_TYPES } from '../../types/work-order.ts';
import { useCreateWorkOrder } from './useWorkOrders.ts';

const CreateWorkOrderSchema = z.object({
  gisId: z.string().min(1, 'gisId zorunlu').max(64),
  type: z.enum(WORK_ORDER_TYPES),
});
type CreateWorkOrderValues = z.infer<typeof CreateWorkOrderSchema>;

export function CreateWorkOrderDialog({ onClose }: { onClose: () => void }) {
  const createWorkOrder = useCreateWorkOrder();
  const { show } = useToast();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkOrderValues>({
    resolver: zodResolver(CreateWorkOrderSchema),
    defaultValues: { type: 'BASIC_WORK' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createWorkOrder.mutateAsync(values);
      show('success', 'İş emri oluşturuldu');
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? err.message : 'İş emri oluşturulamadı' });
    }
  });

  return (
    <Modal title="Yeni İş Emri" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <div className="field">
          <label htmlFor="gisId" className="field__label">
            GIS ID (kesici)
          </label>
          <input id="gisId" placeholder="CB-1024" className="input" {...register('gisId')} />
          {errors.gisId && <p className="field__error">{errors.gisId.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="type" className="field__label">
            Tip
          </label>
          <select id="type" className="select" {...register('type')}>
            {WORK_ORDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {WORK_ORDER_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {errors.type && <p className="field__error">{errors.type.message}</p>}
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            Vazgeç
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn--primary">
            {isSubmitting ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
