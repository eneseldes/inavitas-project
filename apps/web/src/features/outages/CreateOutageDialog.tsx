import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { TextField } from '../../shared/components/form';
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
      cbsId: z.string().min(1, t('outage.validation.cbsIdRequired')).max(64),
      startedAt: z.string().min(1, t('outage.validation.startedAtRequired')),
      endedAt: z.string().optional(),
    })
    .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(data.startedAt), {
      message: t('outage.validation.endedAtBeforeStarted'),
      path: ['endedAt'],
    });
}

interface CreateOutageDialogProps {
  onClose: () => void;
  /**
   * Haritadan açıldığında hedef eleman zaten seçilidir; alan dolu ve **kilitli** gelir.
   * Kesinti oluşturma yolu tek kalsın diye harita için ayrı bir form yazılmaz — aynı
   * dialog, aynı `POST /outages` ucu, aynı doğrulamalar.
   */
  presetCbsId?: string;
}

export function CreateOutageDialog({ onClose, presetCbsId }: CreateOutageDialogProps) {
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
    mode: 'onSubmit',
    defaultValues: { startedAt: toDateTimeLocalInput(new Date()), ...(presetCbsId ? { cbsId: presetCbsId } : {}) },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createOutage.mutateAsync({
        cbsId: values.cbsId,
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

        <TextField
          label={t('outage.dialog.create.cbsIdLabel')}
          error={errors.cbsId?.message}
          readOnly={presetCbsId !== undefined}
          {...register('cbsId')}
        />

        <TextField
          label={t('outage.dialog.create.startedAtLabel')}
          type="datetime-local"
          error={errors.startedAt?.message}
          {...register('startedAt')}
        />

        <TextField
          label={t('outage.dialog.create.endedAtLabel')}
          type="datetime-local"
          hint={t('outage.dialog.create.endedAtHint', { status: labels.outageStatus('ENERGIZED') })}
          error={errors.endedAt?.message}
          {...register('endedAt')}
        />

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
