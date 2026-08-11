import { useEffect, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../../features/i18n/I18nProvider.tsx';
import styles from './Modal.module.scss';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `lg`: geniş, `xl`: çok geniş (çeviri yönetimi vb.), `full`: tam ekran. Varsayılan `md`. */
  size?: 'md' | 'lg' | 'xl' | 'full';
  /** Kapatma butonunun solunda gösterilen ek aksiyonlar (ör. düzenle butonu). */
  headerActions?: ReactNode;
}

/** Basit erişilebilir modal: Escape ile kapanır, arka plana tıklayınca kapanır. */
export function Modal({ title, onClose, children, size = 'md', headerActions }: ModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          styles.panel,
          size === 'lg' && styles['panel--lg'],
          size === 'xl' && styles['panel--xl'],
          size === 'full' && styles['panel--full'],
        )}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerActions}>
            {headerActions}
            <button type="button" onClick={onClose} aria-label={t('common.action.close')} className="icon-btn icon-btn--sm">
              <FiX />
            </button>
          </div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
