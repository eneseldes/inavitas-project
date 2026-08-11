import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { isoToDateTimeLocalInput } from '../../shared/datetime.ts';
import { OUTAGE_STATUS_LABELS } from '../../shared/labels.ts';
import type { Outage, OutageStatus } from '../../types/outage.ts';
import { USER_SELECTABLE_NEXT_STATUSES } from './columns.tsx';
import styles from './EditOutageDialog.module.scss';
import { usePatchOutage } from './useOutages.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function makeSchema(startedAt: string) {
  return z
    .object({
      endedAt: z.string().optional(),
    })
    .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(startedAt), {
      message: "endedAt, startedAt'tan önce olamaz",
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
  const schema = makeSchema(outage.startedAt);
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
      show('success', 'Kesinti güncellendi');
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? err.message : 'Kesinti güncellenemedi' });
    }
  });

  return (
    <Modal title="Kesintiyi Güncelle" onClose={onClose}>
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
          <span className={styles.readOnlyLabel}>Mevcut durum</span>
          <StatusBadge status={outage.status} />
        </div>
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>Başlangıç</span>
          <span className={styles.readOnlyValue}>{dateFormatter.format(new Date(outage.startedAt))}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <div className="field">
          <label htmlFor="endedAt" className="field__label">
            Bitiş zamanı
            <span className="field__hint"> (verilirse durum otomatik "Enerji Verildi" olur)</span>
          </label>
          <input id="endedAt" type="datetime-local" className="input" {...register('endedAt')} />
          {errors.endedAt && <p className="field__error">{errors.endedAt.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="nextStatus" className="field__label">
            Yeni durum
          </label>
          {options.length > 0 ? (
            <select
              id="nextStatus"
              className="select"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as OutageStatus)}
            >
              <option value="" disabled>
                Geçiş seç…
              </option>
              {options.map((status) => (
                <option key={status} value={status}>
                  {OUTAGE_STATUS_LABELS[status]}
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
          <button type="submit" disabled={isSubmitting} className="btn btn--primary">
            {isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
