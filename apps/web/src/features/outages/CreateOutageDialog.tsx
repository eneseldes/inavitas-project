import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { ApiError } from '../../shared/api/errors.ts';
import { toDateTimeLocalInput } from '../../shared/datetime.ts';
import { useLabels } from '../i18n/useLabels.ts';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useCreateOutage } from './useOutages.ts';

/** Bitiş zamanı verilmişse başlangıç zamanından önce olamaz. */
function useCreateOutageSchema() {
  const { t } = useTranslation();
  return z
    .object({
      gisId: z.string().min(1, t('outage.validation.gisIdRequired')).max(64),
      startedAt: z.string().min(1, t('outage.validation.startedAtRequired')),
      endedAt: z.string().optional(),
    })
    .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(data.startedAt), {
      message: t('outage.validation.endedAtBeforeStarted'),
      path: ['endedAt'],
    });
}

export function CreateOutageDialog({ onClose }: { onClose: () => void }) {
  const createOutage = useCreateOutage();
  const { show } = useToast();
  const { t } = useTranslation();
  const labels = useLabels();
  const schema = useCreateOutageSchema();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { startedAt: toDateTimeLocalInput(new Date()) },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createOutage.mutateAsync({
        gisId: values.gisId,
        startedAt: new Date(values.startedAt).toISOString(),
        endedAt: values.endedAt ? new Date(values.endedAt).toISOString() : undefined,
      });
      show('success', t('outage.toast.createSuccess'));
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('outage.toast.createError') });
    }
  });

  return (
    <Modal title={t('outage.dialog.create.title')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <div className="field">
          <label htmlFor="gisId" className="field__label">
            {t('outage.dialog.create.gisIdLabel')}
          </label>
          <input id="gisId" placeholder="CB-1024" className="input" {...register('gisId')} />
          {errors.gisId && <p className="field__error">{errors.gisId.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="startedAt" className="field__label">
            {t('outage.dialog.create.startedAtLabel')}
          </label>
          <input id="startedAt" type="datetime-local" className="input" {...register('startedAt')} />
          {errors.startedAt && <p className="field__error">{errors.startedAt.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="endedAt" className="field__label">
            {t('outage.dialog.create.endedAtLabel')}
            <span className="field__hint"> {t('outage.dialog.create.endedAtHint', { status: labels.outageStatus('ENERGIZED') })}</span>
          </label>
          <input id="endedAt" type="datetime-local" className="input" {...register('endedAt')} />
          {errors.endedAt && <p className="field__error">{errors.endedAt.message}</p>}
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
