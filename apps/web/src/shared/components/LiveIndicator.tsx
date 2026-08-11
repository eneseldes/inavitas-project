import { clsx } from 'clsx';
import { useTranslation } from '../../features/i18n/I18nProvider.tsx';
import styles from './LiveIndicator.module.scss';

/** Canlı veri akışının (SSE) bağlantı durumunu gösteren rozet bileşeni. */
export function LiveIndicator({ connected }: { connected: boolean }) {
  const { t } = useTranslation();

  return (
    <span
      className={clsx('badge', connected ? 'badge--green' : 'badge--gray')}
      title={connected ? t('common.live.activeTitle') : t('common.live.connectingTitle')}
    >
      <span className={styles.dot} />
      {connected ? t('common.live.active') : t('common.live.connecting')}
    </span>
  );
}
