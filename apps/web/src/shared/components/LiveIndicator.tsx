import { clsx } from 'clsx';
import styles from './LiveIndicator.module.scss';

/** Canlı veri akışının (SSE) bağlantı durumunu gösteren rozet bileşeni. */
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
