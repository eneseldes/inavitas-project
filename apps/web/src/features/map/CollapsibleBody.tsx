import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import styles from './MapPanel.module.scss';

/**
 * Katlanabilir bir gövdeyi `grid-template-rows` ile yumuşak açar/kapatır.
 *
 * İçerik `isOpen` false iken de DOM'da kalır (mount/unmount yerine 0fr↔1fr) — aksi halde
 * kapanış anlık olur, yalnız açılış animasyonlanabilirdi. Katmanlar ve filtreler
 * panelindeki her katlanabilir grup (ve içindeki iç içe alt gruplar) bunu kullanır.
 */
export function CollapsibleBody({ isOpen, children }: { isOpen: boolean; children: ReactNode }) {
  return (
    <div className={clsx(styles.collapsibleWrap, isOpen && styles.collapsibleWrapOpen)}>
      <div className={styles.collapsibleInner}>{children}</div>
    </div>
  );
}
