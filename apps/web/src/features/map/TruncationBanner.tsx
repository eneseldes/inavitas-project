import { FiAlertTriangle } from 'react-icons/fi';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import styles from './MapPage.module.scss';

/**
 * Haritada eksik veri olduğunu söyleyen kalıcı şerit.
 *
 * Neden var: sistemde dört ayrı sessiz kırpma noktası var (kesinti/iş emri listesi, izin
 * kimlik listesi, izin vurgu kümesi, enerjisizlik vurgu kümesi) ve hepsinin sonucu aynı —
 * **haritada olması gereken bir şey yok**. Bu bilgi eskiden yalnız kapalı duran Filtreler
 * panelinde küçük bir satırdı; kullanıcı eksik gördüğünü hiç öğrenemiyordu. Uyarı haritanın
 * kendi üstünde durur, çünkü eksik olan haritadır.
 */
export interface TruncationState {
  /** Kesinti/iş emri harita listesi sunucudaki üst sınıra dayandı. */
  records: boolean;
  /** İz / alan / enerjisizlik vurgu kümesi `HIGHLIGHT_SET_ID_LIMIT`'te kırpıldı. */
  highlight: boolean;
}

/**
 * ⚠️ İzin eski `overflowed` bayrağı buradan da izin kendi panelinden de KALKTI: etki
 * hesabında artık 10.000'lik bir kırpma yok (bkz. network-service modules/impact/service.ts).
 * Kırpma yalnız `outage-service`'e giden Kafka olayında var ve orası haritayı ilgilendirmez —
 * bu şerit yalnız **haritada eksik olan** şeyi anlatır.
 */

export function TruncationBanner({ state }: { state: TruncationState }) {
  const { t } = useTranslation();

  const reasons: string[] = [];
  if (state.records) reasons.push(t('map.truncated.records', undefined, 'kesinti/iş emri listesi'));
  if (state.highlight) reasons.push(t('map.truncated.highlight', undefined, 'vurgulanan küme'));

  if (reasons.length === 0) return null;

  return (
    <div className={styles.truncationBanner} role="status">
      <FiAlertTriangle aria-hidden />
      <span>
        {t(
          'map.truncated.banner',
          undefined,
          'Haritada eksik veri var — üst sınıra dayanıldı. Filtreyi daraltın.',
        )}{' '}
        <em>({reasons.join(', ')})</em>
      </span>
    </div>
  );
}
