import { FiX } from 'react-icons/fi';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useComponent } from './useNetwork.ts';
import styles from './DetailPanel.module.scss';

interface DetailPanelProps {
  selectedId: string | undefined;
  onClose: () => void;
}

function formatAttribute(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

/** Sol panel v1 — haritada tıklanan elemanın özeti. */
export function DetailPanel({ selectedId, onClose }: DetailPanelProps) {
  const { t } = useTranslation();
  const { data: component, isLoading } = useComponent(selectedId);

  return (
    <aside className={styles.panel}>
      {!selectedId && <p className={styles.empty}>{t('map.panel.detail.empty')}</p>}

      {selectedId && isLoading && <p className={styles.empty}>{t('common.loading')}</p>}

      {selectedId && component && (
        <>
          <div className={styles.header}>
            <h2 className={styles.id}>{component.id}</h2>
            <button type="button" className="icon-btn icon-btn--sm" aria-label={t('common.action.close')} onClick={onClose}>
              <FiX />
            </button>
          </div>
          <p className={styles.typeBadge}>{t(`network.enum.componentType.${component.type}`)}</p>

          <dl className={styles.fields}>
            <div className={styles.field}>
              <dt>{t('map.panel.detail.field.voltageLevel')}</dt>
              <dd>{t(`network.enum.voltageLevel.${component.voltageLevel}`)}</dd>
            </div>
            {formatAttribute(component.attributes?.capacity_kva) && (
              <div className={styles.field}>
                <dt>{t('map.panel.detail.field.capacity')}</dt>
                <dd>{formatAttribute(component.attributes?.capacity_kva)} kVA</dd>
              </div>
            )}
            {component.status && (
              <div className={styles.field}>
                <dt>{t('map.panel.detail.field.status')}</dt>
                <dd>{component.status}</dd>
              </div>
            )}
            <div className={styles.field}>
              <dt>{t('map.panel.detail.field.unitPath')}</dt>
              <dd>{component.unitAncestors.map((u) => u.name).join(' › ')}</dd>
            </div>
            {formatAttribute(component.attributes?.customer_count) && (
              <div className={styles.field}>
                <dt>{t('map.panel.detail.field.customerCount')}</dt>
                <dd>{formatAttribute(component.attributes?.customer_count)}</dd>
              </div>
            )}
          </dl>
        </>
      )}
    </aside>
  );
}
