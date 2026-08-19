import { FiAlertTriangle } from 'react-icons/fi';
import { clsx } from 'clsx';
import { Modal } from '../../shared/components/Modal.tsx';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import type { NetworkComponentDetail } from '../../types/network.ts';
import { useImpactPreview } from './useNetwork.ts';
import styles from './ImpactConfirmDialog.module.scss';

interface ImpactConfirmDialogProps {
  component: NetworkComponentDetail;
  /** Onaydan sonra açılacak kayıt türü — başlık ve buton metni buna göre değişir. */
  kind: 'outage' | 'workOrder';
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Kesinti/iş emri formundan **önceki zorunlu ara adım**: elemanın etkisi gösterilir ve
 * kullanıcı onaylamadan forma geçilmez.
 *
 * ⚠️ Buradaki sayı bir bilgilendirmedir, bir yetki kararı değildir. Kaydın kendisi
 * `POST /outages` (ya da `/work-orders`) ucunda read-model'den okunan topoloji seviyesiyle
 * yeniden doğrulanır — önizleme ile kayıt arasında zaman geçebilir ve bu ekran hiç
 * görülmeden de istek atılabilir.
 */
export function ImpactConfirmDialog({ component, kind, onCancel, onConfirm }: ImpactConfirmDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { data: preview, isLoading, isError } = useImpactPreview(component.id);

  const isHighImpact = preview?.highImpact ?? false;
  /**
   * Yüksek etkili kesinti ek izin ister; yoksa buton pasif kalır ve gerekçesi yazılır.
   *
   * İş emrinde burada engellenmez: ek izin yalnız **kesintiye yol açan** türlerde
   * (`PLANNED_OUTAGE_WORK_ORDER` / `UNPLANNED_OUTAGE_WORK_ORDER`) aranıyor ve tür bir
   * sonraki adımda seçiliyor — burada kesip atmak, aynı direkte aydınlatma iş emri açmayı
   * da yasaklardı. Uyarı yine gösterilir, kararı sunucu türle birlikte verir.
   */
  const isBlocked = kind === 'outage' && isHighImpact && !hasPermission('outage:write-high-impact');
  const title = kind === 'outage' ? t('map.confirm.outageTitle') : t('map.confirm.workOrderTitle');

  return (
    <Modal title={title} onClose={onCancel}>
      <div className={clsx(styles.body, isHighImpact && styles.bodyHighImpact)}>
        {isHighImpact && (
          <p className={styles.highImpactBanner}>
            <FiAlertTriangle /> {t('map.confirm.highImpactWarning')}
          </p>
        )}
        {isHighImpact && kind === 'workOrder' && (
          <p className={styles.blocked}>{t('map.confirm.highImpactWorkOrderNote')}</p>
        )}

        <dl className={styles.summary}>
          <div className={styles.row}>
            <dt>{t('map.confirm.componentLabel')}</dt>
            <dd>
              <span className="font-mono">{component.id}</span>
              {' · '}
              {component.breakerRole
                ? t(`network.enum.breakerRole.${component.breakerRole}`)
                : t(`network.enum.componentType.${component.type}`)}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('map.confirm.locationLabel')}</dt>
            <dd>{component.unitAncestors.map((u) => u.name).join(' › ')}</dd>
          </div>
        </dl>

        {isLoading && <p className={styles.pending}>{t('common.loading')}</p>}
        {isError && <p className={styles.pending}>{t('map.confirm.previewFailed')}</p>}

        {preview && preview.radialityViolated && (
          // Radyallik bozukken etki kümesi güvenilmez; sayı uydurmak yerine durum söylenir.
          <p className={styles.pending}>{t('map.trace.radialityViolated')}</p>
        )}

        {preview && !preview.radialityViolated && (
          <>
            <p className={styles.impactLead}>{t('map.confirm.impactLead')}</p>
            <ul className={styles.impactList}>
              <li>
                <strong>{preview.affectedElementCount.toLocaleString('tr-TR')}</strong>{' '}
                {t('map.confirm.impactElements')}
              </li>
              <li>
                <strong>{preview.affectedCustomerCount.toLocaleString('tr-TR')}</strong>{' '}
                {t('map.confirm.impactCustomers')}
              </li>
            </ul>
          </>
        )}

        {isBlocked && <p className={styles.blocked}>{t('map.confirm.highImpactForbidden')}</p>}
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn--ghost">
          {t('common.action.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading || isBlocked}
          className={clsx('btn', isHighImpact ? 'btn--danger' : 'btn--primary')}
        >
          {kind === 'outage' ? t('map.action.createOutage') : t('map.action.createWorkOrder')}
        </button>
      </div>
    </Modal>
  );
}
