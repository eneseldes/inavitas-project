import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DetailPanel } from './DetailPanel.tsx';
import { ImpactConfirmDialog } from './ImpactConfirmDialog.tsx';
import { MapView } from './MapView.tsx';
import { ModePanel } from './ModePanel.tsx';
import { useMapState } from './useMapState.ts';
import { useComponent, useTrace } from './useNetwork.ts';
import type { TraceDirection } from './api.ts';
import { CreateOutageDialog } from '../outages/CreateOutageDialog.tsx';
import { useOutageMapItems } from '../outages/useOutages.ts';
import { useOutageStream } from '../outages/useOutageStream.ts';
import { CreateWorkOrderDialog } from '../work-orders/CreateWorkOrderDialog.tsx';
import { useWorkOrderMapItems } from '../work-orders/useWorkOrders.ts';
import { useWorkOrderStream } from '../work-orders/useWorkOrderStream.ts';
import styles from './MapPage.module.scss';

/** Haritadan başlatılan kayıt akışının adımı: önce etki onayı, sonra kayıt formu. */
type ActionStep = 'confirm' | 'form';

/** `/map` — sol panel (seçim özeti), harita, sağ panel (katmanlar ve filtreler). */
export function MapPage() {
  const {
    view,
    setView,
    legend,
    toggleLegend,
    voltageLevels,
    toggleVoltageLevel,
    showAdminBoundaries,
    setShowAdminBoundaries,
    showOutages,
    setShowOutages,
    showWorkOrders,
    setShowWorkOrders,
    showOutageHeatmap,
    setShowOutageHeatmap,
    outageFilters,
    patchOutageFilters,
    workOrderFilters,
    patchWorkOrderFilters,
    selectedId,
    setSelectedId,
    focusId,
    resolveFocus,
  } = useMapState();
  const [isModePanelExpanded, setIsModePanelExpanded] = useState(true);
  const navigate = useNavigate();
  const { data: focusComponent } = useComponent(focusId);
  const { data: selectedComponent } = useComponent(selectedId);

  // İz ve aksiyon durumu URL'e yazılmaz: ikisi de sol panele bağlı geçici bir görünümdür,
  // panel kapanınca (ya da başka bir eleman seçilince) düşerler.
  const [traceDirection, setTraceDirection] = useState<TraceDirection | undefined>(undefined);
  const [action, setAction] = useState<{ kind: 'outage' | 'workOrder'; step: ActionStep } | undefined>(undefined);

  const { data: trace, isLoading: isTraceLoading } = useTrace(selectedId, traceDirection);

  // Canlılık: kesinti ve iş emri akışlarına abone olunur; gelen her olay ilgili sorguları
  // invalidate ettiği için harita katmanı sayfa yenilenmeden tazelenir.
  useOutageStream();
  useWorkOrderStream();

  // Katman kapalıyken sorgu hiç atılmaz — harita açılışında iki gereksiz istek olmaz.
  // Hiçbir durum seçili değilse de sorgu atılmaz: boş durum listesi sunucuda "filtre yok"
  // demektir ve kullanıcının hepsini kapatması yanlışlıkla TÜM kayıtları çizerdi.
  const hasOutageStatus = (outageFilters.status?.length ?? 0) > 0;
  const hasWorkOrderStatus = (workOrderFilters.status?.length ?? 0) > 0;
  const outageQueryEnabled = (showOutages || showOutageHeatmap) && hasOutageStatus;
  const workOrderQueryEnabled = showWorkOrders && hasWorkOrderStatus;
  const { data: outageData } = useOutageMapItems(outageFilters, outageQueryEnabled);
  const { data: workOrderData } = useWorkOrderMapItems(workOrderFilters, workOrderQueryEnabled);

  // Sorgu kapatıldığında TanStack Query son veriyi önbellekte tutar; katmanı temizlemek
  // için veriyi burada da düşürmek gerekir, yoksa eski noktalar haritada asılı kalır.
  const outageItems = outageQueryEnabled ? outageData?.items : undefined;
  const workOrderItems = workOrderQueryEnabled ? workOrderData?.items : undefined;

  useEffect(() => {
    if (!focusComponent) return;
    resolveFocus(focusComponent.id);
    // Yalnız dışarıdan gelen `focus` id'si değişince tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusComponent]);

  // Seçim değişince açık iz ve yarım kalmış aksiyon düşer — yeni elemanın paneli eskisinin
  // izini devralmamalı; aksi halde vurgu ile panel farklı elemanı anlatır.
  useEffect(() => {
    setTraceDirection(undefined);
    setAction(undefined);
  }, [selectedId]);

  const flyTo =
    focusComponent && focusComponent.lat !== null && focusComponent.lon !== null
      ? { lng: focusComponent.lon, lat: focusComponent.lat, zoom: view.zoom }
      : undefined;

  /**
   * Vurgulanacak kimlikler. Tıklanan elemanın kendisi de listeye girer — iz onunla başlar,
   * kullanıcı hangi elemandan baktığını görmelidir.
   */
  const tracedIds = useMemo(() => {
    if (!trace) return undefined;
    if (trace.direction === 'down') return [trace.componentId, ...trace.affectedElementIds];
    return [trace.componentId, ...trace.chain.map((item) => item.id)];
  }, [trace]);

  /**
   * Haritadaki bir kesinti/iş emri noktasına tıklamak ilgili detay sayfasını açar —
   * harita bir liste değil, kaydın kendisi kendi ekranında yönetilir. Yönlendirme mevcut
   * `related*Id` desenini kullanır (tablolar arası geçişte de bu kullanılıyor).
   */
  const handleSelectOperation = (kind: 'outage' | 'workOrder', id: string) => {
    navigate(kind === 'outage' ? `/outages?relatedOutageId=${id}` : `/work-orders?relatedWorkOrderId=${id}`);
  };

  return (
    <div className={styles.page}>
      <DetailPanel
        selectedId={selectedId}
        onClose={() => setSelectedId(undefined)}
        traceDirection={traceDirection}
        onToggleTrace={(direction) => setTraceDirection((prev) => (prev === direction ? undefined : direction))}
        trace={trace}
        isTraceLoading={isTraceLoading}
        onCreateOutage={() => setAction({ kind: 'outage', step: 'confirm' })}
        onCreateWorkOrder={() => setAction({ kind: 'workOrder', step: 'confirm' })}
        onOpenRecord={handleSelectOperation}
      />

      <div className={styles.mapArea}>
        <MapView
          view={view}
          onViewChange={setView}
          legend={legend}
          voltageLevels={voltageLevels}
          showAdminBoundaries={showAdminBoundaries}
          selectedId={selectedId}
          onSelect={setSelectedId}
          flyTo={flyTo}
          tracedIds={tracedIds}
          traceDirection={traceDirection}
          traceBbox={trace?.bbox}
          outages={outageItems}
          workOrders={workOrderItems}
          showOutages={showOutages}
          showWorkOrders={showWorkOrders}
          showOutageHeatmap={showOutageHeatmap}
          onSelectOperation={handleSelectOperation}
        />
      </div>

      <ModePanel
        isExpanded={isModePanelExpanded}
        onToggleExpanded={() => setIsModePanelExpanded((prev) => !prev)}
        legend={legend}
        onToggleLegend={toggleLegend}
        voltageLevels={voltageLevels}
        onToggleVoltageLevel={toggleVoltageLevel}
        showAdminBoundaries={showAdminBoundaries}
        onShowAdminBoundariesChange={setShowAdminBoundaries}
        showOutages={showOutages}
        onShowOutagesChange={setShowOutages}
        showWorkOrders={showWorkOrders}
        onShowWorkOrdersChange={setShowWorkOrders}
        showOutageHeatmap={showOutageHeatmap}
        onShowOutageHeatmapChange={setShowOutageHeatmap}
        outageFilters={outageFilters}
        onOutageFiltersChange={patchOutageFilters}
        workOrderFilters={workOrderFilters}
        onWorkOrderFiltersChange={patchWorkOrderFilters}
        outageTruncated={outageData?.truncated ?? false}
        workOrderTruncated={workOrderData?.truncated ?? false}
      />

      {/* Etki onayı → kayıt formu. Form yeni değil: tablodaki ile aynı dialog, CBS ID'si
          dolu ve kilitli gelir; istek de aynı `POST /outages` ucuna gider. */}
      {action?.step === 'confirm' && selectedComponent && (
        <ImpactConfirmDialog
          component={selectedComponent}
          kind={action.kind}
          onCancel={() => setAction(undefined)}
          onConfirm={() => setAction({ kind: action.kind, step: 'form' })}
        />
      )}

      {action?.step === 'form' && action.kind === 'outage' && selectedId && (
        <CreateOutageDialog presetCbsId={selectedId} onClose={() => setAction(undefined)} />
      )}

      {action?.step === 'form' && action.kind === 'workOrder' && selectedId && (
        <CreateWorkOrderDialog presetCbsId={selectedId} onClose={() => setAction(undefined)} />
      )}
    </div>
  );
}
