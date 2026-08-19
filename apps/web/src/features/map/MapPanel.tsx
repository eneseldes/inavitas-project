import { FiX } from 'react-icons/fi';
import type { ReactNode } from 'react';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import styles from './MapPanel.module.scss';

interface MapPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Sağ şeritten açılan panellerin ortak kabuğu: sabit başlık + kendi içinde kayan gövde.
 *
 * Kaydırma gövdenin içindedir, panelin tamamında değil — başlık her zaman görünür kalır ve
 * panel hiçbir koşulda harita alanının dışına taşmaz.
 */
export function MapPanel({ title, onClose, children }: MapPanelProps) {
  const { t } = useTranslation();

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={t('common.action.close')} onClick={onClose}>
          <FiX />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </aside>
  );
}
