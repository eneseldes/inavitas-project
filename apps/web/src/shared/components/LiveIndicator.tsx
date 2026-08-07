import { clsx } from 'clsx';
import styles from './LiveIndicator.module.scss';

/** SSE bağlantı durumunu gösteren küçük rozet — Faz 5'in canlı güncellemesini görünür kılar. */
export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span
      className={clsx('badge', connected ? 'badge--green' : 'badge--gray')}
      title={connected ? 'Canlı güncellemeler aktif' : 'Canlı bağlantı kuruluyor'}
    >
      <span className={styles.dot} />
      {connected ? 'Canlı' : 'Bağlanıyor…'}
    </span>
  );
}
