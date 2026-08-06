import { useEffect, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';
import styles from './Modal.module.scss';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Basit erişilebilir modal: Escape ile kapanır, arka plana tıklayınca kapanır. */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="icon-btn icon-btn--sm">
            <FiX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
