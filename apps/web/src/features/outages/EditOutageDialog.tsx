import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { isoToDateTimeLocalInput } from '../../shared/datetime.ts';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { Outage, OutageStatus } from '../../types/outage.ts';
import { USER_SELECTABLE_NEXT_STATUSES } from './columns.tsx';
import styles from './EditOutageDialog.module.scss';
import { usePatchOutage } from './useOutages.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function makeSchema(startedAt: string, invalidMessage: string) {
  return z
    .object({
      endedAt: z.string().optional(),
    })
    .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(startedAt), {
      message: invalidMessage,
      path: ['endedAt'],
    });
}

interface EditOutageDialogProps {
  outage: Outage;
  onClose: () => void;
}

/** Kesinti güncelleme modalı. */
export function EditOutageDialog({ outage, onClose }: EditOutageDialogProps) {
  const patchOutage = usePatchOutage();
  const { show } = useToast();
  const { t } = useTranslation();
  const labels = useLabels();
  const schema = makeSchema(outage.startedAt, t('outage.validation.endedAtBeforeStarted'));
  const options = USER_SELECTABLE_NEXT_STATUSES[outage.status] || [];
  const [nextStatus, setNextStatus] = useState<OutageStatus | ''>('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      endedAt: isoToDateTimeLocalInput(outage.endedAt),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await patchOutage.mutateAsync({
        id: outage.id,
        version: outage.version,
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(values.endedAt ? { endedAt: new Date(values.endedAt).toISOString() } : {}),
      });
      show('success', t('outage.toast.updateSuccess'));
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('outage.toast.updateError') });
    }
  });

  return (
    <Modal title={t('outage.dialog.edit.title')} onClose={onClose}>
      <div className={styles.readOnlyBlock}>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>ID</span>
          <span className={`${styles.readOnlyValue} font-mono`} title={outage.id}>
            {outage.id.slice(0, 8)}
          </span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>GIS ID</span>
          <span className={`${styles.readOnlyValue} font-mono`}>{outage.gisId}</span>
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>{t('outage.dialog.edit.currentStatusLabel')}</span>
          <StatusBadge status={outage.status} />
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>{t('outage.column.startedAt')}</span>
          <span className={styles.readOnlyValue}>{dateFormatter.format(new Date(outage.startedAt))}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <div className="field">
          <label htmlFor="endedAt" className="field__label">
            {t('outage.dialog.create.endedAtLabel')}
            <span className="field__hint"> {t('outage.dialog.edit.endedAtHint', { status: labels.outageStatus('ENERGIZED') })}</span>
          </label>
          <input id="endedAt" type="datetime-local" className="input" {...register('endedAt')} />
          {errors.endedAt && <p className="field__error">{errors.endedAt.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="nextStatus" className="field__label">
            {t('outage.dialog.edit.nextStatusLabel')}
          </label>
          {options.length > 0 ? (
            <select
              id="nextStatus"
              className="select"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as OutageStatus)}
            >
              <option value="" disabled>
                {t('outage.dialog.edit.selectTransition')}
              </option>
              {options.map((status) => (
                <option key={status} value={status}>
                  {labels.outageStatus(status)}
                </option>
              ))}
            </select>
          ) : (
            <p className="field__hint">{t('outage.dialog.edit.noTransitions')}</p>
          )}
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn--primary">
            {isSubmitting ? t('common.action.saving') : t('common.action.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
