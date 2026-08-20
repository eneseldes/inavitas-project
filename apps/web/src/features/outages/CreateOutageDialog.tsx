import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { CascadeConfirmDialog } from '../map/CascadeConfirmDialog.tsx';
import { gateBlockMessageKey, toCreateErrorMessage } from '../map/operationErrors.ts';
import { useOperationGuards } from '../map/useOperationGuards.ts';
import { useDebounce } from '../../shared/hooks/useDebounce.ts';
import { TextField } from '../../shared/components/form';
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

/** Kapı sorgusu, kullanıcı yazmayı bıraktıktan bu kadar sonra çalışır. */
const GUARD_DEBOUNCE_MS = 400;

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
  const [cascadePending, setCascadePending] = useState(false);
  const cascadeConfirmedRef = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { startedAt: toDateTimeLocalInput(new Date()), ...(presetCbsId ? { cbsId: presetCbsId } : {}) },
  });

  // CBS ID yazıldıkça kapı çalışır; kullanıcı gönderime kadar beklemek zorunda kalmaz.
  // Debounce şart: her tuş vuruşunda etki önizlemesi sunucuda bir graf gezinmesi demektir
  // ve "104049" yazmak üç yarım kimlik için üç boşuna BFS tetiklerdi.
  const cbsId = watch('cbsId');
  const debouncedCbsId = useDebounce(cbsId, GUARD_DEBOUNCE_MS);
  const guards = useOperationGuards(debouncedCbsId && debouncedCbsId.length > 0 ? debouncedCbsId : undefined);

  /**
   * Kaskad onayı form doğrulamasından **sonra** sorulur. Önce sorulsaydı geçersiz bir
   * formda modal açılır, kullanıcı onaylar, gönderim sessizce doğrulamaya takılır ve modal
   * hiç kapanmazdı.
   */
  const onSubmit = handleSubmit(async (values) => {
    if (guards.childOutageCount > 0 && !cascadeConfirmedRef.current) {
      setCascadePending(true);
      return;
    }

    try {
      await createOutage.mutateAsync({
        cbsId: values.cbsId,
        startedAt: new Date(values.startedAt).toISOString(),
        endedAt: values.endedAt ? new Date(values.endedAt).toISOString() : undefined,
      });
      show('success', t('outage.toast.createSuccess'));
      onClose();
    } catch (err) {
      setError('root', { message: toCreateErrorMessage(err, 'outage', t) });
    } finally {
      // Yeniden denemede onay tekrar sorulur: bu arada alt kesinti kümesi değişmiş olabilir.
      cascadeConfirmedRef.current = false;
      setCascadePending(false);
    }
  });

  const confirmCascade = () => {
    cascadeConfirmedRef.current = true;
    setCascadePending(false);
    void onSubmit();
  };

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

        {guards.outageBlocked && <div className="form-error-banner">{t(gateBlockMessageKey('outage', guards))}</div>}

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button type="submit" disabled={isSubmitting || guards.outageBlocked} className="btn btn--primary">
            {isSubmitting ? t('common.action.creating') : t('common.action.create')}
          </button>
        </div>
      </form>

      {cascadePending && (
        <CascadeConfirmDialog
          childOutages={guards.childOutages}
          childOutageCount={guards.childOutageCount}
          onCancel={() => setCascadePending(false)}
          onConfirm={confirmCascade}
        />
      )}
    </Modal>
  );
}
