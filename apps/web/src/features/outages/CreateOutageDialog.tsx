import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { ApiError } from '../../shared/api/errors.ts';
import { toDateTimeLocalInput } from '../../shared/datetime.ts';
import { useCreateOutage } from './useOutages.ts';

/** Bitiş zamanı verilmişse başlangıç zamanından önce olamaz. */
const CreateOutageSchema = z
  .object({
    gisId: z.string().min(1, 'gisId zorunlu').max(64),
    startedAt: z.string().min(1, 'Başlangıç zamanı zorunlu'),
    endedAt: z.string().optional(),
  })
  .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(data.startedAt), {
    message: "endedAt, startedAt'tan önce olamaz",
    path: ['endedAt'],
  });
type CreateOutageValues = z.infer<typeof CreateOutageSchema>;

export function CreateOutageDialog({ onClose }: { onClose: () => void }) {
  const createOutage = useCreateOutage();
  const { show } = useToast();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateOutageValues>({
    resolver: zodResolver(CreateOutageSchema),
    defaultValues: { startedAt: toDateTimeLocalInput(new Date()) },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createOutage.mutateAsync({
        gisId: values.gisId,
        startedAt: new Date(values.startedAt).toISOString(),
        endedAt: values.endedAt ? new Date(values.endedAt).toISOString() : undefined,
      });
      show('success', 'Kesinti oluşturuldu');
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? err.message : 'Kesinti oluşturulamadı' });
    }
  });

  return (
    <Modal title="Yeni Kesinti" onClose={onClose}>
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
          <label htmlFor="startedAt" className="field__label">
            Başlangıç zamanı
          </label>
          <input id="startedAt" type="datetime-local" className="input" {...register('startedAt')} />
          {errors.startedAt && <p className="field__error">{errors.startedAt.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="endedAt" className="field__label">
            Bitiş zamanı
            <span className="field__hint"> (opsiyonel — verilirse durum otomatik "Enerji Verildi" olur)</span>
          </label>
          <input id="endedAt" type="datetime-local" className="input" {...register('endedAt')} />
          {errors.endedAt && <p className="field__error">{errors.endedAt.message}</p>}
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
