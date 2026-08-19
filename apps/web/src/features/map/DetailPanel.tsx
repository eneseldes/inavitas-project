import { useMemo } from 'react';
import { FiAlertTriangle, FiArrowDownCircle, FiArrowUpCircle, FiTool, FiX, FiZap } from 'react-icons/fi';
import { clsx } from 'clsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useOutages } from '../outages/useOutages.ts';
import { useWorkOrders } from '../work-orders/useWorkOrders.ts';
import type { DownstreamImpact, UpstreamChain } from '../../types/network.ts';
import type { TraceDirection } from './api.ts';
import { useComponent } from './useNetwork.ts';
import styles from './DetailPanel.module.scss';

interface DetailPanelProps {
  selectedId: string | undefined;
  onClose: () => void;
  /** Açık olan iz yönü; hiçbiri açık değilse `undefined`. */
  traceDirection: TraceDirection | undefined;
  onToggleTrace: (direction: TraceDirection) => void;
  trace: DownstreamImpact | UpstreamChain | undefined;
  isTraceLoading: boolean;
  onCreateOutage: () => void;
  onCreateWorkOrder: () => void;
  /** Haritadaki bir kesinti/iş emri kaydını kendi detay sayfasında açar. */
  onOpenRecord: (kind: 'outage' | 'workOrder', id: string) => void;
}

/** Elemana bağlı kayıtların panelde gösterilen sayısı — panel bir liste ekranı değildir. */
const LINKED_RECORD_LIMIT = 5;

function formatAttribute(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

/** Sol panel — haritada tıklanan elemanın özeti, izi ve üzerinden açılabilen aksiyonlar. */
export function DetailPanel({
  selectedId,
  onClose,
  traceDirection,
  onToggleTrace,
  trace,
  isTraceLoading,
  onCreateOutage,
  onCreateWorkOrder,
  onOpenRecord,
}: DetailPanelProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { data: component, isLoading } = useComponent(selectedId);

  // Elemana bağlı kesinti/iş emri kayıtları — "haritada tıkla → sol panel → id → detay
  // sayfası" yolunun harita ucu. Sorgu yalnız bir eleman seçiliyken atılır.
  const outageQuery = useMemo(
    () => ({
      page: 1,
      pageSize: LINKED_RECORD_LIMIT,
      sort: { field: 'createdAt', dir: 'desc' as const },
      filters: { cbsId: selectedId },
    }),
    [selectedId],
  );
  const workOrderQuery = useMemo(
    () => ({
      page: 1,
      pageSize: LINKED_RECORD_LIMIT,
      sort: { field: 'createdAt', dir: 'desc' as const },
      filters: { cbsId: selectedId },
    }),
    [selectedId],
  );
  const { data: outages } = useOutages(outageQuery, selectedId !== undefined && hasPermission('outage:read'));
  const { data: workOrders } = useWorkOrders(workOrderQuery, selectedId !== undefined && hasPermission('workorder:read'));

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
          <p className={styles.typeBadge}>
            {t(`network.enum.componentType.${component.type}`)}
            {component.breakerRole && ` · ${t(`network.enum.breakerRole.${component.breakerRole}`)}`}
          </p>

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

          {/* --- İz aksiyonları: seçili yön ikinci kez tıklanınca kapanır. --- */}
          <div className={styles.actions}>
            <button
              type="button"
              className={clsx('btn', 'btn--ghost', styles.action, traceDirection === 'up' && styles.actionActive)}
              aria-pressed={traceDirection === 'up'}
              onClick={() => onToggleTrace('up')}
            >
              <FiArrowUpCircle /> {t('map.action.traceUp')}
            </button>
            <button
              type="button"
              className={clsx('btn', 'btn--ghost', styles.action, traceDirection === 'down' && styles.actionActive)}
              aria-pressed={traceDirection === 'down'}
              onClick={() => onToggleTrace('down')}
            >
              <FiArrowDownCircle /> {t('map.action.traceDown')}
            </button>
          </div>

          {traceDirection && <TraceSummary trace={trace} isLoading={isTraceLoading} />}

          {/* --- Kayıt aksiyonları: yetkisiz kullanıcıda hiç görünmez. --- */}
          {(hasPermission('outage:write') || hasPermission('workorder:write')) && (
            <div className={styles.actions}>
              {hasPermission('outage:write') && (
                <button type="button" className={clsx('btn', 'btn--primary', styles.action)} onClick={onCreateOutage}>
                  <FiZap /> {t('map.action.createOutage')}
                </button>
              )}
              {hasPermission('workorder:write') && (
                <button type="button" className={clsx('btn', 'btn--ghost', styles.action)} onClick={onCreateWorkOrder}>
                  <FiTool /> {t('map.action.createWorkOrder')}
                </button>
              )}
            </div>
          )}

          {(outages?.items.length ?? 0) > 0 && (
            <section className={styles.linked}>
              <h3 className={styles.linkedTitle}>{t('map.panel.detail.linkedOutages')}</h3>
              <ul className={styles.linkedList}>
                {outages!.items.map((outage) => (
                  <li key={outage.id}>
                    <button type="button" className={styles.linkedItem} onClick={() => onOpenRecord('outage', outage.id)}>
                      <span className="font-mono">{outage.id.slice(0, 8)}</span>
                      <StatusBadge status={outage.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(workOrders?.items.length ?? 0) > 0 && (
            <section className={styles.linked}>
              <h3 className={styles.linkedTitle}>{t('map.panel.detail.linkedWorkOrders')}</h3>
              <ul className={styles.linkedList}>
                {workOrders!.items.map((workOrder) => (
                  <li key={workOrder.id}>
                    <button
                      type="button"
                      className={styles.linkedItem}
                      onClick={() => onOpenRecord('workOrder', workOrder.id)}
                    >
                      <span className="font-mono">{workOrder.id.slice(0, 8)}</span>
                      <StatusBadge status={workOrder.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </aside>
  );
}

/** İz sonucunun tek satırlık özeti — asıl gösterim haritanın kendisidir. */
function TraceSummary({
  trace,
  isLoading,
}: {
  trace: DownstreamImpact | UpstreamChain | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading || !trace) return <p className={styles.traceSummary}>{t('common.loading')}</p>;

  if (trace.direction === 'down') {
    // Radyallik bozuksa etki kümesi güvenilmez ve boş döner; sayı yerine uyarı gösterilir.
    if (trace.radialityViolated) {
      return (
        <p className={clsx(styles.traceSummary, styles.traceWarning)}>
          <FiAlertTriangle /> {t('map.trace.radialityViolated')}
        </p>
      );
    }
    return (
      <>
        <p className={styles.traceSummary}>
          {t('map.trace.downstreamSummary', {
            elements: trace.affectedElementCount.toLocaleString('tr-TR'),
            customers: trace.affectedCustomerCount.toLocaleString('tr-TR'),
          })}
        </p>
        {/* Sayılar kırpılmaz, **kimlik listesi** kırpılır (bkz. IMPACT_ID_LIMIT). Yani sayı
            doğru ama haritada boyanan küme eksik — bu ayrım açıkça söylenir. */}
        {trace.overflowed && <p className={styles.traceNote}>{t('map.trace.overflowed')}</p>}
      </>
    );
  }

  return <p className={styles.traceSummary}>{t('map.trace.upstreamSummary', { count: trace.chain.length })}</p>;
}
