import { FiMinus, FiPlus } from 'react-icons/fi';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import styles from './MapZoomControl.module.scss';

interface MapZoomControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
}

/** Haritanın sağ üst köşesindeki yakınlaştırma kontrolü — proje düğme diliyle. */
export function MapZoomControl({ onZoomIn, onZoomOut }: MapZoomControlProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.control}>
      <button
        type="button"
        className={`icon-btn ${styles.button}`}
        aria-label={t('map.action.zoomIn', undefined, 'Yakınlaştır')}
        onClick={onZoomIn}
      >
        <FiPlus />
      </button>
      <span className={styles.separator} />
      <button
        type="button"
        className={`icon-btn ${styles.button}`}
        aria-label={t('map.action.zoomOut', undefined, 'Uzaklaştır')}
        onClick={onZoomOut}
      >
        <FiMinus />
      </button>
    </div>
  );
}
