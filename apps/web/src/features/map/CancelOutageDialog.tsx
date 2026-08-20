import { FiAlertTriangle } from 'react-icons/fi';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useOutage, usePatchOutage } from '../outages/useOutages.ts';
import styles from './CreateOperationDialog.module.scss';

interface CancelOutageDialogProps {
  outageId: string;
  onClose: () => void;
}

/**
 * Kesinti iptal onayı — mevcut `Modal` üzerine kurulur, yeni bir modal altyapısı yazılmaz.
 *
 * İptal iki yönlü bir işlemdir: bağlı iş emri de iptal edilir ve karartılan elemanlar
 * yeniden enerjilenir. Kullanıcı bunu **önceden** bilmeli — kesinti iptali geri alınamaz
 * (`CANCELLED` durumu kilitlidir).
 */
export function CancelOutageDialog({ outageId, onClose }: CancelOutageDialogProps) {
  const { t } = useTranslation();
  const { show } = useToast();
  const { data: outage, isLoading } = useOutage(outageId);
  const patchOutage = usePatchOutage();

  const onConfirm = async () => {
    if (!outage) return;
    try {
      // İyimser kilit: `version` kaydın kendisinden okunur, istemcide sayılmaz.
      await patchOutage.mutateAsync({ id: outageId, status: 'CANCELLED', version: outage.version });
      show('success', t('outage.toast.updateSuccess'));
      onClose();
    } catch {
      show('error', t('outage.toast.updateError'));
    }
  };

  return (
    <Modal title={t('map.action.cancelOutageConfirmTitle')} onClose={onClose}>
      <p className={styles.highImpactBanner}>
        <FiAlertTriangle /> {t('map.action.cancelOutageConfirmBody')}
      </p>

      {outage?.workOrderId && <p className={styles.blocked}>{t('map.action.cancelOutageWorkOrderNote')}</p>}

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn btn--ghost">
          {t('common.action.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void onConfirm()}
          disabled={isLoading || patchOutage.isPending}
          className="btn btn--danger"
        >
          {patchOutage.isPending ? t('common.action.saving') : t('map.action.cancelOutage')}
        </button>
      </div>
    </Modal>
  );
}
