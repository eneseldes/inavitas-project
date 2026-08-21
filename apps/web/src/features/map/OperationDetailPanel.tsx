import { useState } from 'react';
import { FiMap, FiX, FiXCircle } from 'react-icons/fi';
import { clsx } from 'clsx';
import { RecordLink } from '../../shared/components/RecordLink.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { useOutage } from '../outages/useOutages.ts';
import { useWorkOrder } from '../work-orders/useWorkOrders.ts';
import { DetailRow, DetailSection, unitAncestorName } from './MapDetailRows.tsx';
import { useComponent } from './useNetwork.ts';
import { CancelOutageDialog } from './CancelOutageDialog.tsx';
import { useAuth } from '../auth/useAuth.tsx';
import styles from './DetailPanel.module.scss';

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

interface OperationDetailPanelProps {
  kind: 'outage' | 'workOrder';
  id: string;
  onClose: () => void;
  /** Kaydın kendi detay sayfasını açar — panel yalnız bir özet, tam kayıt orada. */
  onOpenRecord: (kind: 'outage' | 'workOrder', id: string) => void;
  /** Bağlı kaydın (kesinti ↔ iş emri) özetine geçer — bu panel gibi, tam sayfaya atlamaz. */
  onSelectOperation: (kind: 'outage' | 'workOrder', id: string) => void;
  /** Elemanın kendi özet paneline geçer (haritadaki eleman seçimiyle aynı yol). */
  onSelectComponent: (id: string) => void;
}

/**
 * Haritadaki bir kesinti/iş emri işaretçisine tıklayınca açılan özet panel.
 *
 * Tıklama artık doğrudan kaydın kendi sayfasına atlamaz — önce burada özet gösterilir,
 * kaydın kendi sayfasına gitmek isteyen kullanıcı Genel bölümündeki id satırına basar
 * (bkz. eleman seçiminde `DetailPanel`, aynı iki adımlı desen).
 */
export function OperationDetailPanel({
  kind,
  id,
  onClose,
  onOpenRecord,
  onSelectOperation,
  onSelectComponent,
}: OperationDetailPanelProps) {
  const { t } = useTranslation();
  const labels = useLabels();
  const { hasPermission } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const { data: outage, isLoading: isOutageLoading } = useOutage(kind === 'outage' ? id : undefined);
  const { data: workOrder, isLoading: isWorkOrderLoading } = useWorkOrder(kind === 'workOrder' ? id : undefined);
  // Kesinti/iş emri kendi kaydında elemanın tipini/adını taşır ama il-ilçe-mahalle zincirini
  // taşımaz — o yalnız eleman detayında var. İkisini ayrı sorgulamak yerine tek eleman
  // sorgusu her ikisini de verir (bkz. DetailPanel'in aynı deseni).
  const cbsId = outage?.cbsId ?? workOrder?.cbsId;
  const { data: component } = useComponent(cbsId);

  const isLoading = kind === 'outage' ? isOutageLoading : isWorkOrderLoading;
  const title =
    kind === 'outage'
      ? t('map.panel.detail.outageTitle', undefined, 'Kesinti Detayı')
      : t('map.panel.detail.workOrderTitle', undefined, 'İş Emri Detayı');

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={t('common.action.close')} onClick={onClose}>
          <FiX />
        </button>
      </header>

      <div className={styles.body}>
        {isLoading && <p className={styles.empty}>{t('common.loading')}</p>}

        {kind === 'outage' && outage && (
          <>
            <DetailSection title={t('map.panel.detail.section.general', undefined, 'Genel')}>
              <DetailRow label="ID">
                <RecordLink id={outage.id} onClick={() => onOpenRecord('outage', outage.id)} title={t('map.action.openRecord')} />
              </DetailRow>
              <DetailRow label={t('map.panel.detail.field.status')}>
                <StatusBadge status={outage.status} />
              </DetailRow>
              <DetailRow label={t('outage.column.origin')}>{labels.origin(outage.origin)}</DetailRow>
              <DetailRow label={t('outage.column.startedAt')}>{shortDateFormatter.format(new Date(outage.startedAt))}</DetailRow>
              <DetailRow label={t('outage.column.endedAt')}>
                {outage.endedAt ? shortDateFormatter.format(new Date(outage.endedAt)) : undefined}
              </DetailRow>
              <DetailRow label={t('outage.column.durationMinutes')}>
                {outage.durationMinutes !== null ? outage.durationMinutes : undefined}
              </DetailRow>
              <DetailRow label={t('outage.detail.affectedCustomerCountLabel', undefined, 'Etkilenen Abone')}>
                {outage.affectedCustomerCount !== null ? outage.affectedCustomerCount : undefined}
              </DetailRow>
              {outage.workOrderId && (
                <DetailRow label={t('outage.column.workOrderId')}>
                  <RecordLink
                    id={outage.workOrderId}
                    onClick={() => onSelectOperation('workOrder', outage.workOrderId!)}
                    title={t('outage.action.openWorkOrder')}
                  />
                </DetailRow>
              )}
            </DetailSection>

            <ComponentSection cbsId={outage.cbsId} component={component} onSelectComponent={onSelectComponent} />

            {/* Kullanıcı kesintiyi buradan da görüyor; iptal de buradan yapılabilmeli.
                Sol paneldeki aksiyonla aynı akış, aynı onay modali. */}
            {hasPermission('outage:write') && outage.status === 'STARTED' && (
              <div className={styles.actionsGrid}>
                <button
                  type="button"
                  className={clsx('btn', 'btn--danger', styles.action)}
                  onClick={() => setCancelling(true)}
                >
                  <FiXCircle /> {t('map.action.cancelOutage')}
                </button>
              </div>
            )}

            {cancelling && <CancelOutageDialog outageId={outage.id} onClose={() => setCancelling(false)} />}
          </>
        )}

        {kind === 'workOrder' && workOrder && (
          <>
            <DetailSection title={t('map.panel.detail.section.general', undefined, 'Genel')}>
              <DetailRow label="ID">
                <RecordLink
                  id={workOrder.id}
                  onClick={() => onOpenRecord('workOrder', workOrder.id)}
                  title={t('map.action.openRecord')}
                />
              </DetailRow>
              <DetailRow label={t('map.panel.detail.field.status')}>
                <StatusBadge status={workOrder.status} />
              </DetailRow>
              <DetailRow label={t('work-order.column.type')}>{labels.workOrderType(workOrder.type)}</DetailRow>
              <DetailRow label={t('work-order.column.origin')}>{labels.origin(workOrder.origin)}</DetailRow>
              <DetailRow label={t('work-order.column.createdAt')}>
                {shortDateFormatter.format(new Date(workOrder.createdAt))}
              </DetailRow>
              <DetailRow label={t('work-order.dialog.edit.createdByLabel', undefined, 'Oluşturan')}>
                {labels.actor(workOrder.createdBy)}
              </DetailRow>
              {workOrder.outageId && (
                <DetailRow label={t('work-order.column.outageId')}>
                  <RecordLink
                    id={workOrder.outageId}
                    onClick={() => onSelectOperation('outage', workOrder.outageId!)}
                    title={t('work-order.action.openOutage')}
                  />
                </DetailRow>
              )}
            </DetailSection>

            <ComponentSection cbsId={workOrder.cbsId} component={component} onSelectComponent={onSelectComponent} />
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * "Eleman" bölümü — kesinti ve iş emri panelleri arasında birebir aynı, tek yerde tutulur.
 * Eleman id'si en başta ve tıklanabilir: basınca o elemanın kendi özet paneli açılır.
 */
function ComponentSection({
  cbsId,
  component,
  onSelectComponent,
}: {
  cbsId: string;
  component: ReturnType<typeof useComponent>['data'];
  onSelectComponent: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <DetailSection title={t('map.panel.detail.section.component', undefined, 'Eleman')}>
      <DetailRow label="CBS ID">
        <button type="button" className="link" onClick={() => onSelectComponent(cbsId)} title={t('map.action.showOnMap')}>
          <FiMap />
          <span className="font-mono">{cbsId}</span>
        </button>
      </DetailRow>
      {component && (
        <>
          <DetailRow label={t('map.result.column.type')}>
            {t(`network.enum.componentType.${component.type}`, undefined, component.type)}
          </DetailRow>
          <DetailRow label={t('map.result.column.name')}>{component.name}</DetailRow>
          <DetailRow label={t('map.panel.detail.field.province', undefined, 'İl')}>
            {unitAncestorName(component.unitAncestors, 'PROVINCE')}
          </DetailRow>
          <DetailRow label={t('map.panel.detail.field.district', undefined, 'İlçe')}>
            {unitAncestorName(component.unitAncestors, 'DISTRICT')}
          </DetailRow>
          <DetailRow label={t('map.panel.detail.field.unitPath')}>
            {unitAncestorName(component.unitAncestors, 'NEIGHBORHOOD')}
          </DetailRow>
        </>
      )}
    </DetailSection>
  );
}

/** Kaydın kendi id'si — basılabilir olduğu yeşil renkle belli olur, sayfasını açar. */
