import { FiTrash2 } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { MapPanel } from './MapPanel.tsx';
import styles from './MapPanel.module.scss';

interface AreaSelectPanelProps {
  onClose: () => void;
  isDrawing: boolean;
  hasArea: boolean;
  onClearArea: () => void;
}

/**
 * Alan seçimi paneli — yalnız poligon çizim durumunu anlatır ve çizilmiş alanı temizler.
 *
 * Araç seçilir seçilmez çizim kendiliğinden başlar (bkz. MapPage.tsx): burada ayrı bir
 * "çizimi başlat" düğmesi yok, imlecin haritada artıya dönmesi zaten çizimin başladığını
 * söyler. Alanın içinde NEYİN aranacağı burada seçilmez — o, Katmanlar ve Filtreler
 * panellerinin o an açık olan durumundan gelir; sonuç sol panelde listelenir.
 */
export function AreaSelectPanel({ onClose, isDrawing, hasArea, onClearArea }: AreaSelectPanelProps) {
  const { t } = useTranslation();

  return (
    <MapPanel title={t('map.tool.area')} onClose={onClose}>
      <p className={styles.hint}>{t(isDrawing ? 'map.area.drawingHint' : 'map.area.idleHint')}</p>
      <p className={styles.hint}>
        <strong>{t('map.area.noteLabel', undefined, 'Not:')}</strong>{' '}
        {t(
          'map.area.noteScope',
          undefined,
          'Alanın içinde ne aranacağı Katmanlar ve Filtreler panellerindeki o anki seçime göre belirlenir.',
        )}
      </p>

      {hasArea && (
        <div className={styles.actions}>
          <button type="button" className={clsx('btn', 'btn--danger', styles.action)} onClick={onClearArea}>
            <FiTrash2 /> {t('map.area.clear')}
          </button>
        </div>
      )}
    </MapPanel>
  );
}
