import { useState } from 'react';
import {
  FiAlertTriangle,
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiTool,
  FiX,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';
import { clsx } from 'clsx';
import { RecordLink } from '../../shared/components/RecordLink.tsx';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import type { DownstreamImpact, UpstreamChain } from '../../types/network.ts';
import type { TraceDirection } from './api.ts';
import { DetailRow, DetailSection, unitAncestorName } from './MapDetailRows.tsx';
import { useComponent } from './useNetwork.ts';
import { useOperationGuards } from './useOperationGuards.ts';
import { CancelOutageDialog } from './CancelOutageDialog.tsx';
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
  /**
   * Elemana bağlı bir kesinti/iş emri kaydına tıklanınca çağrılır. Kaydın kendi sayfasına
   * DOĞRUDAN atlamaz — haritadaki işaretçi tıklamasıyla aynı yolu izler: önce
   * `OperationDetailPanel` özetini açar, tam kayda geçiş oradaki id bağlantısından yapılır.
   */
  onSelectOperation: (kind: 'outage' | 'workOrder', id: string) => void;
}

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
  onSelectOperation,
}: DetailPanelProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { data: component, isLoading } = useComponent(selectedId);
  const guards = useOperationGuards(selectedId);
  const [cancelTarget, setCancelTarget] = useState<string | undefined>(undefined);

  // Panel yalnız bir eleman seçiliyken vardır: boş bir "haritada bir eleman seçin" kutusu
  // haritanın beşte birini sürekli kaplıyordu.
  if (!selectedId) return null;

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('map.panel.detail.componentTitle', undefined, 'Eleman Detayı')}</h2>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={t('common.action.close')} onClick={onClose}>
          <FiX />
        </button>
      </header>

      <div className={styles.body}>
        {isLoading && <p className={styles.empty}>{t('common.loading')}</p>}

        {component && (
          <>
            <DetailSection title={t('map.panel.detail.section.general', undefined, 'Genel')}>
              <DetailRow label="ID">
                <span className="font-mono">{selectedId}</span>
              </DetailRow>
              {/* Kesici rolü VARSA tip yerine o yazılır, ikisi yan yana DEĞİL: bir kofranın
                  ham tipi `CIRCUIT_BREAKER` olduğu için satır "Kesici · Kofra Kesicisi"
                  diye okunuyordu — kofra tek bir birimdir, adı da tektir. Aynı kural
                  `CreateOperationDialog`te zaten uygulanıyordu; iki ekran ayrışmasın. */}
              <DetailRow label={t('map.result.column.type')}>
                {component.breakerRole
                  ? t(`network.enum.breakerRole.${component.breakerRole}`)
                  : t(`network.enum.componentType.${component.type}`)}
              </DetailRow>
              <DetailRow label={t('map.panel.detail.field.voltageLevel')}>
                {t(`network.enum.voltageLevel.${component.voltageLevel}`)}
              </DetailRow>
              <DetailRow label={t('map.panel.detail.field.capacity')}>
                {formatAttribute(component.attributes?.capacity_kva)
                  ? `${formatAttribute(component.attributes?.capacity_kva)} kVA`
                  : undefined}
              </DetailRow>
              {/* Durum anlık enerjilenmedir — kolondan değil, aktif kesintilerden türetilir. */}
              <DetailRow label={t('map.panel.detail.field.status')}>
                {t(`network.enum.energization.${component.isEnergized ? 'ENERGIZED' : 'DE_ENERGIZED'}`)}
              </DetailRow>
              <DetailRow label={t('map.panel.detail.field.customerCount')}>
                {formatAttribute(component.attributes?.customer_count)}
              </DetailRow>
              {component.deEnergizedBy && (
                <DetailRow label={t('map.panel.detail.field.deEnergizedBy')}>
                  <RecordLink
                    id={component.deEnergizedBy}
                    onClick={() => onSelectOperation('outage', component.deEnergizedBy!)}
                    title={t('map.action.openRecord')}
                  />
                </DetailRow>
              )}
            </DetailSection>

            <DetailSection title={t('map.panel.detail.section.location', undefined, 'Konum')}>
              <DetailRow label={t('map.panel.detail.field.province', undefined, 'İl')}>
                {unitAncestorName(component.unitAncestors, 'PROVINCE')}
              </DetailRow>
              <DetailRow label={t('map.panel.detail.field.district', undefined, 'İlçe')}>
                {unitAncestorName(component.unitAncestors, 'DISTRICT')}
              </DetailRow>
              <DetailRow label={t('map.panel.detail.field.unitPath')}>
                {unitAncestorName(component.unitAncestors, 'NEIGHBORHOOD')}
              </DetailRow>
            </DetailSection>

            {/* --- İz aksiyonları: seçili yön ikinci kez tıklanınca kapanır. --- */}
            <div className={styles.actionsGrid}>
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

            {/* --- Kayıt aksiyonları: yetkisiz kullanıcıda hiç görünmez. Kesinti düğmesi
                satırın sağında kalsın diye markup'ta İş Emri'nden SONRA gelir.

                Düğme matrisi:
                - kendi üzerinde aktif kesinti varsa "Kesinti Aç" yerine "Kesintiyi İptal Et"
                - üstteki kesinti yüzünden enerjisizse "Kesinti Aç" pasif + sebep + engelleyen
                  kesintiye bağlantı
                - aktif iş emri varsa "İş Emri Aç" pasif --- */}
            {(hasPermission('outage:write') || hasPermission('workorder:write')) && (
              <div className={styles.actionsGrid}>
                {hasPermission('workorder:write') && (
                  <button
                    type="button"
                    className={clsx('btn', 'btn--ghost', styles.action)}
                    disabled={guards.workOrderBlocked}
                    onClick={onCreateWorkOrder}
                  >
                    <FiTool /> {t('map.action.createWorkOrder')}
                  </button>
                )}
                {hasPermission('outage:write') && guards.activeOutageOnSelf && (
                  <button
                    type="button"
                    className={clsx('btn', 'btn--danger', styles.action)}
                    onClick={() => setCancelTarget(guards.activeOutageOnSelf)}
                  >
                    <FiXCircle /> {t('map.action.cancelOutage')}
                  </button>
                )}
                {hasPermission('outage:write') && !guards.activeOutageOnSelf && (
                  <button
                    type="button"
                    className={clsx('btn', 'btn--primary', styles.action)}
                    disabled={guards.outageBlocked}
                    onClick={onCreateOutage}
                  >
                    <FiZap /> {t('map.action.createOutage')}
                  </button>
                )}
              </div>
            )}

            {/* Engelin sebebi ve "hangi kesinti yüzünden" bağlantısı — kullanıcı pasif bir
                düğmeye bakıp neden olduğunu tahmin etmek zorunda kalmamalı. */}
            {guards.workOrderBlocked && <p className={styles.blockReason}>{t('map.block.workOrderActive')}</p>}
            {guards.outageBlocked && guards.outageBlockReason === 'DE_ENERGIZED' && (
              <p className={styles.blockReason}>{t('map.block.deEnergized')}</p>
            )}

            {cancelTarget && (
              <CancelOutageDialog outageId={cancelTarget} onClose={() => setCancelTarget(undefined)} />
            )}
          </>
        )}
      </div>
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
    // Kamera da hareket etmez (`bbox: null`) — uyarı olmadan "düğme çalışmadı" gibi durur.
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
        <TraceExtentNotes trace={trace} />
      </>
    );
  }

  return (
    <>
      <p className={styles.traceSummary}>{t('map.trace.upstreamSummary', { count: trace.chain.length })}</p>
      <TraceExtentNotes trace={trace} />
    </>
  );
}

/**
 * İzin haritadaki karşılığıyla ilgili iki sessiz durumun açık karşılığı: vurgu kümesinin
 * kırpılması ve kapsayan dikdörtgenin hesaplanamaması. İkisi de "harita bir şey yapmadı"
 * gibi görünür; söylenmezse kullanıcı düğmenin bozuk olduğunu sanır.
 */
function TraceExtentNotes({ trace }: { trace: DownstreamImpact | UpstreamChain }) {
  const { t } = useTranslation();

  return (
    <>
      {trace.setTruncated && <p className={styles.traceNote}>{t('map.trace.setTruncated')}</p>}
      {trace.bbox === null && <p className={styles.traceNote}>{t('map.trace.noBbox')}</p>}
    </>
  );
}
