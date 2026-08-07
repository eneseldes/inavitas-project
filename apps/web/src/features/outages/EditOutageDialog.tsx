import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import type { Outage } from '../../types/outage.ts';
import styles from './EditOutageDialog.module.scss';
import { usePatchOutage } from './useOutages.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/** `datetime-local` input'unun beklediği `YYYY-MM-DDTHH:mm` biçimi. */
function toDateTimeLocal(iso: string | null): string {
  return iso ? iso.slice(0, 16) : '';
}

function makeSchema(startedAt: string) {
  return z
    .object({ endedAt: z.string().optional() })
    .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(startedAt), {
      message: "endedAt, startedAt'tan önce olamaz",
      path: ['endedAt'],
    });
}

interface EditOutageDialogProps {
  outage: Outage;
  onClose: () => void;
}

/**
 * Kesinti güncelleme modalı — İşlemler sütunundaki kalem ikonuyla açılır.
 *
 * Backend PATCH /outages/:id yalnızca `status` ve `endedAt` alanlarını kabul
 * ediyor (bkz. outage-service/src/http/schemas.ts PatchOutageBody); `status`
 * burada BİLEREK gönderilmiyor — durum geçişleri sütundaki ayrı select'in
 * işi (kısıtlı liste, ENERGIZED içermez). Bu modal yalnızca `endedAt`i
 * düzeltmek/kaydetmek için var. `endedAt` ilk kez set edildiğinde backend'in
 * FR-2.6 kuralı gereği durum otomatik ENERGIZED'a geçebilir — bu, "gerçekte
 * ne zaman bittiğini kaydetme" eylemi, kullanıcının elle "ENERGIZED yap"
 * demesinden farklı ve dokümante edilmiş bir davranış.
 */
export function EditOutageDialog({ outage, onClose }: EditOutageDialogProps) {
  const patchOutage = usePatchOutage();
  const { show } = useToast();
  const schema = makeSchema(outage.startedAt);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { endedAt: toDateTimeLocal(outage.endedAt) },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await patchOutage.mutateAsync({
        id: outage.id,
        version: outage.version,
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
          <span className={styles.readOnlyLabel}>Durum</span>
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
            <span className="field__hint"> (verilirse durum otomatik "Enerji Verildi" olabilir — FR-2.6)</span>
          </label>
          <input id="endedAt" type="datetime-local" className="input" {...register('endedAt')} />
          {errors.endedAt && <p className="field__error">{errors.endedAt.message}</p>}
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
