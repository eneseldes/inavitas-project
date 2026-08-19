import type { ReactNode } from 'react';
import type { UnitAncestor, UnitLevel } from '../../types/network.ts';
import styles from './DetailPanel.module.scss';

/** Ata zincirinden tek bir seviyenin adını çeker — il/ilçe/mahalle satırları bunu paylaşır. */
export function unitAncestorName(ancestors: UnitAncestor[], level: UnitLevel): string | undefined {
  return ancestors.find((a) => a.level === level)?.name;
}

/**
 * Bölümlü etiket/değer satırları — eleman, kesinti ve iş emri özet panelleri (harita)
 * bunu paylaşır. `DetailRow` `undefined`/`null` döndürürse hiç basılmaz; bir alanın
 * verisi yoksa boş satır göstermek yerine satırın kendisi hiç yer kaplamaz.
 */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <dl className={styles.rows}>{children}</dl>
    </section>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  if (children === undefined || children === null || children === '') return null;

  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
