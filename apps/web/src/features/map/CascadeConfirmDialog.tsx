import { FiAlertTriangle } from 'react-icons/fi';
import { Modal } from '../../shared/components/Modal.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import type { ChildOutage } from '../../types/network.ts';
import styles from './CreateOperationDialog.module.scss';

interface CascadeConfirmDialogProps {
  childOutages: ChildOutage[];
  /** Kırpılmamış toplam — liste kırpılır, sayı kırpılmaz. */
  childOutageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Kaskad onay modalı — **bir bilgilendirmedir, güvenlik kapısı değil.**
 *
 * Kaskad bağını kuran zaten sunucudur ve otomatiktir. Sunucunun bu onayı yeniden
 * doğrulaması için grafı sorgulaması gerekirdi — bu da senkron servisler-arası çağrı demek.
 * Kullanıcı onaylamasa da bağ kurulacaktı; modal kullanıcıya **ne olacağını söyler**, bir
 * izin sormaz. Bu yüzden onay sunucuya bir API alanı olarak **gönderilmez**.
 *
 * Yalnız kesintide çıkar; iş emri kaskad kurmaz.
 */
export function CascadeConfirmDialog({
  childOutages,
  childOutageCount,
  onConfirm,
  onCancel,
}: CascadeConfirmDialogProps) {
  const { t } = useTranslation();
  const hiddenCount = childOutageCount - childOutages.length;

  return (
    // `lg`: uyarı satırı + alt kesinti listesi varsayılan genişlikte üç satıra sarıyordu.
    <Modal title={t('map.cascade.title')} onClose={onCancel} size="lg">
      <p className={styles.warningBanner}>
        <FiAlertTriangle /> {t('map.cascade.body', { count: childOutageCount.toLocaleString('tr-TR') })}
      </p>

      <ul className={styles.cascadeList}>
        {childOutages.map((child) => (
          <li key={child.outageId} className={styles.cascadeItem}>
            <span className="font-mono">{child.cbsId}</span>
            <span>
              {t(`network.enum.componentType.${child.componentType}`)}
              {child.componentName ? ` · ${child.componentName}` : ''}
            </span>
            <span className={styles.cascadeCount}>
              {t('map.cascade.customerCount', { count: child.affectedCustomerCount.toLocaleString('tr-TR') })}
            </span>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && <p className={styles.pending}>{t('map.cascade.more', { count: hiddenCount.toLocaleString('tr-TR') })}</p>}

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn--ghost">
          {t('common.action.cancel')}
        </button>
        <button type="button" onClick={onConfirm} className="btn btn--danger">
          {t('map.cascade.confirm')}
        </button>
      </div>
    </Modal>
  );
}
