import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import type { Polygon } from 'geojson';
import { AreaResultPanel } from './AreaResultPanel.tsx';
import { AreaSelectPanel } from './AreaSelectPanel.tsx';
import { CreateOperationDialog } from './CreateOperationDialog.tsx';
import { DetailPanel } from './DetailPanel.tsx';
import { FiltersPanel } from './FiltersPanel.tsx';
import { LayersPanel } from './LayersPanel.tsx';
import { MapToolRail, type MapTool } from './MapToolRail.tsx';
import { MapView, type MapZoomApi } from './MapView.tsx';
import { MapZoomControl } from './MapZoomControl.tsx';
import { OperationDetailPanel } from './OperationDetailPanel.tsx';
import { useAreaResults, useAreaSelectionState } from './useAreaSelection.ts';
import { useMapState } from './useMapState.ts';
import { useComponent, useTrace } from './useNetwork.ts';
import type { TraceDirection } from './api.ts';
import { useOutageMapItems } from '../outages/useOutages.ts';
import { useOutageStream } from '../outages/useOutageStream.ts';
import { useWorkOrderMapItems } from '../work-orders/useWorkOrders.ts';
import { useWorkOrderStream } from '../work-orders/useWorkOrderStream.ts';
import styles from './MapPage.module.scss';

/** Bir elemana odaklanırken gidilen zoom — bina izinin açıldığı seviyenin üstü. */
const FOCUS_ZOOM = 17;

/** Listeden bir kayda gidilirken kullanılan en küçük zoom; işaretçiler burada teker teker açılır. */
const RECORD_ZOOM = 15;

/** `/map` — harita tam alanı kaplar, paneller üstüne biner. */
export function MapPage() {
  const {
    view,
    setView,
    legend,
    toggleLegend,
    toggleLegendGroup,
    voltageLevels,
    setVoltageLevels,
    showAdminBoundaries,
    setShowAdminBoundaries,
    showOutages,
    setShowOutages,
    showWorkOrders,
    setShowWorkOrders,
    setShowOperationsLayers,
    activeHeatmap,
    setActiveHeatmap,
    outageFilters,
    patchOutageFilters,
    workOrderFilters,
    patchWorkOrderFilters,
    selectedId,
    setSelectedId,
    focusId,
    resolveFocus,
  } = useMapState();
  const [activeTool, setActiveTool] = useState<MapTool | undefined>(undefined);
  const [mapZoomApi, setMapZoomApi] = useState<MapZoomApi | undefined>(undefined);
  const navigate = useNavigate();
  const { data: focusComponent } = useComponent(focusId);
  const { data: selectedComponent } = useComponent(selectedId);

  // İz, aksiyon ve kamera hedefi URL'e yazılmaz: üçü de geçici görünüm durumudur.
  const [traceDirection, setTraceDirection] = useState<TraceDirection | undefined>(undefined);
  const [action, setAction] = useState<'outage' | 'workOrder' | undefined>(undefined);
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; zoom: number } | undefined>(undefined);
  const [isAreaDrawing, setIsAreaDrawing] = useState(false);
  const [selectedOperationId, setSelectedOperationId] = useState<string | undefined>(undefined);
  /** Haritada tıklanan kesinti/iş emri işaretçisinin özet paneli — bkz. `selectOperation`. */
  const [operationDetail, setOperationDetail] = useState<{ kind: 'outage' | 'workOrder'; id: string } | undefined>(
    undefined,
  );

  const { data: trace, isLoading: isTraceLoading } = useTrace(selectedId, traceDirection);

  // Canlılık: kesinti ve iş emri akışlarına abone olunur; gelen her olay ilgili sorguları
  // invalidate ettiği için harita katmanı sayfa yenilenmeden tazelenir.
  useOutageStream();
  useWorkOrderStream();

  // Alan seçiminin durumu sorgulardan ÖNCE kurulur: hangi kayıt sorgularının açılacağını
  // bu durum belirler, sonuçları da bir alt satırdaki `useAreaResults` süzer.
  const area = useAreaSelectionState();

  // Katman kapalıyken sorgu hiç atılmaz — harita açılışında iki gereksiz istek olmaz.
  // Hiçbir durum seçili değilse de sorgu atılmaz: boş durum listesi sunucuda "filtre yok"
  // demektir ve kullanıcının hepsini kapatması yanlışlıkla TÜM kayıtları çizerdi.
  // Alan seçimi kayıtları da aynı veriden süzdüğü için sorguyu o da açabilir.
  const hasOutageStatus = (outageFilters.status?.length ?? 0) > 0;
  const hasWorkOrderStatus = (workOrderFilters.status?.length ?? 0) > 0;
  // Alan içindeki kesinti/iş emri dahiliyeti artık ayrı bir seçim değil — Katmanlar
  // panelindeki görünürlükle birebir aynıdır (bkz. AreaSelectPanel.tsx).
  const showOutageHeatmap = activeHeatmap === 'outage';
  const outageQueryEnabled = (showOutages || showOutageHeatmap) && hasOutageStatus;
  const workOrderQueryEnabled = showWorkOrders && hasWorkOrderStatus;
  const { data: outageData } = useOutageMapItems(outageFilters, outageQueryEnabled);
  const { data: workOrderData } = useWorkOrderMapItems(workOrderFilters, workOrderQueryEnabled);

  // Sorgu kapatıldığında TanStack Query son veriyi önbellekte tutar; katmanı temizlemek
  // için veriyi burada da düşürmek gerekir, yoksa eski noktalar haritada asılı kalır.
  const outageItems = outageQueryEnabled ? outageData?.items : undefined;
  const workOrderItems = workOrderQueryEnabled ? workOrderData?.items : undefined;

  const areaResults = useAreaResults({
    state: area,
    outages: outageItems,
    workOrders: workOrderItems,
    voltageLevels,
    includeOutages: showOutages,
    includeWorkOrders: showWorkOrders,
  });

  useEffect(() => {
    if (!focusComponent) return;
    resolveFocus(focusComponent.id);
    if (focusComponent.lat !== null && focusComponent.lon !== null) {
      setFlyTo({ lng: focusComponent.lon, lat: focusComponent.lat, zoom: FOCUS_ZOOM });
    }
    // Yalnız dışarıdan gelen `focus` id'si değişince tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusComponent]);

  // Seçim değişince açık iz ve yarım kalmış aksiyon düşer — yeni elemanın paneli eskisinin
  // izini devralmamalı; aksi halde vurgu ile panel farklı elemanı anlatır.
  useEffect(() => {
    setTraceDirection(undefined);
    setAction(undefined);
  }, [selectedId]);

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
  const openRecord = useCallback(
    (kind: 'outage' | 'workOrder', id: string) => {
      navigate(kind === 'outage' ? `/outages?relatedOutageId=${id}` : `/work-orders?relatedWorkOrderId=${id}`);
    },
    [navigate],
  );

  /**
   * Haritadaki bir kesinti/iş emri işaretçisine tıklamak artık kaydın kendi sayfasına
   * atlamaz — önce özet panel açılır (bkz. `OperationDetailPanel`), sayfaya geçiş oradaki
   * id bağlantısından yapılır. Eleman seçimiyle aynı anda görünmesin diye ikisi birbirini
   * kapatır.
   */
  const selectOperation = useCallback((kind: 'outage' | 'workOrder', id: string) => {
    setOperationDetail({ kind, id });
    setSelectedOperationId(id);
    setSelectedId(undefined);
  }, [setSelectedId]);

  const selectComponent = useCallback(
    (id: string | undefined) => {
      setOperationDetail(undefined);
      setSelectedId(id);
    },
    [setSelectedId],
  );

  /**
   * Alan sonuçları listesinden bir kesinti/iş emri satırına tıklamak — özet paneli AÇAR
   * (`selectOperation`) VE kamerayı üstüne getirir. Eskiden yalnız kamerayı getirip paneli
   * açmıyordu; eleman satırları paneli açıyordu ama kamerayı getirmiyordu — ikisi tutarsızdı.
   */
  const selectAreaOperation = useCallback(
    (kind: 'outage' | 'workOrder', id: string) => {
      selectOperation(kind, id);
      const item =
        kind === 'outage'
          ? areaResults.outagesInArea.find((row) => row.id === id)
          : areaResults.workOrdersInArea.find((row) => row.id === id);
      if (item) setFlyTo({ lng: item.lon, lat: item.lat, zoom: Math.max(view.zoom, RECORD_ZOOM) });
    },
    [selectOperation, areaResults.outagesInArea, areaResults.workOrdersInArea, view.zoom],
  );

  /** Alan sonuçları listesinden bir eleman satırına tıklamak — bkz. `selectAreaOperation`. */
  const selectAreaComponent = useCallback(
    (id: string) => {
      selectComponent(id);
      const item = areaResults.components?.items.find((row) => row.id === id);
      if (item && item.lat !== null && item.lon !== null) {
        setFlyTo({ lng: item.lon, lat: item.lat, zoom: Math.max(view.zoom, RECORD_ZOOM) });
      }
    },
    [selectComponent, areaResults.components, view.zoom],
  );

  const { applyPolygon } = area;

  const startDrawing = useCallback(() => {
    applyPolygon(null);
    setIsAreaDrawing(true);
  }, [applyPolygon]);

  const handleAreaDrawn = useCallback(
    (polygon: Polygon) => {
      applyPolygon(polygon);
      setIsAreaDrawing(false);
    },
    [applyPolygon],
  );

  const clearArea = useCallback(() => {
    applyPolygon(null);
    setSelectedOperationId(undefined);
    setIsAreaDrawing(false);
  }, [applyPolygon]);

  // Alan aracı seçilir seçilmez çizim kendiliğinden başlar — ayrı bir "çizimi başlat"
  // düğmesi yok, imlecin artıya dönmesi zaten başladığını söyler. Alandan çıkılırken
  // yarım kalan çizim de burada iptal edilir.
  useEffect(() => {
    if (activeTool === 'area' && !area.polygon && !isAreaDrawing) startDrawing();
    if (activeTool !== 'area' && isAreaDrawing) setIsAreaDrawing(false);
  }, [activeTool, area.polygon, isAreaDrawing, startDrawing]);

  return (
    <div className={styles.page}>
      <div className={styles.mapArea}>
        <MapView
          view={view}
          onViewChange={setView}
          legend={legend}
          voltageLevels={voltageLevels}
          showAdminBoundaries={showAdminBoundaries}
          selectedId={selectedId}
          onSelect={selectComponent}
          flyTo={flyTo}
          tracedIds={tracedIds}
          traceDirection={traceDirection}
          traceBbox={trace?.bbox}
          outages={outageItems}
          workOrders={workOrderItems}
          showOutages={showOutages}
          showWorkOrders={showWorkOrders}
          showOutageHeatmap={showOutageHeatmap}
          selectedOperationId={selectedOperationId}
          onSelectOperation={selectOperation}
          isAreaDrawing={isAreaDrawing}
          areaPolygon={area.polygon}
          onAreaDrawn={handleAreaDrawn}
          onAreaDrawingChange={setIsAreaDrawing}
          onMapReady={setMapZoomApi}
        />
      </div>

      {/* Sol yaka — yalnız gösterecek bir şey varken vardır: seçili eleman ve/veya alan sonucu. */}
      <div className={clsx(styles.dock, styles.dockLeft)}>
        {area.polygon && (
          <AreaResultPanel
            onClose={clearArea}
            components={areaResults.components}
            isLoadingComponents={areaResults.isLoading}
            isFetchingComponents={areaResults.isFetching}
            onRefreshComponents={() => void areaResults.refetch()}
            page={area.page}
            pageSize={area.pageSize}
            onPageChange={area.setPage}
            onPageSizeChange={area.setPageSize}
            outages={areaResults.outagesInArea}
            workOrders={areaResults.workOrdersInArea}
            includeOutages={showOutages}
            includeWorkOrders={showWorkOrders}
            selectedComponentId={selectedId}
            onSelectComponent={selectAreaComponent}
            selectedOperationId={selectedOperationId}
            onSelectOperation={selectAreaOperation}
          />
        )}

        <DetailPanel
          selectedId={selectedId}
          onClose={() => setSelectedId(undefined)}
          traceDirection={traceDirection}
          onToggleTrace={(direction) => setTraceDirection((prev) => (prev === direction ? undefined : direction))}
          trace={trace}
          isTraceLoading={isTraceLoading}
          onCreateOutage={() => setAction('outage')}
          onCreateWorkOrder={() => setAction('workOrder')}
          onSelectOperation={selectOperation}
        />

        {operationDetail && (
          <OperationDetailPanel
            kind={operationDetail.kind}
            id={operationDetail.id}
            onClose={() => {
              setOperationDetail(undefined);
              setSelectedOperationId(undefined);
            }}
            onOpenRecord={openRecord}
            onSelectOperation={selectOperation}
            onSelectComponent={selectComponent}
          />
        )}
      </div>

      {/* Sağ yaka — araç şeridi her zaman görünür, panel yalnız seçili araç için açılır. */}
      <div className={clsx(styles.dock, styles.dockRight)}>
        {activeTool === 'layers' && (
          <LayersPanel
            onClose={() => setActiveTool(undefined)}
            legend={legend}
            onToggleLegend={toggleLegend}
            onToggleLegendGroup={toggleLegendGroup}
            showAdminBoundaries={showAdminBoundaries}
            onShowAdminBoundariesChange={setShowAdminBoundaries}
            showOutages={showOutages}
            onShowOutagesChange={setShowOutages}
            showWorkOrders={showWorkOrders}
            onShowWorkOrdersChange={setShowWorkOrders}
            onShowOperationsLayersChange={setShowOperationsLayers}
            activeHeatmap={activeHeatmap}
            onActiveHeatmapChange={setActiveHeatmap}
          />
        )}

        {activeTool === 'filters' && (
          <FiltersPanel
            onClose={() => setActiveTool(undefined)}
            voltageLevels={voltageLevels}
            onVoltageLevelsChange={setVoltageLevels}
            showOutages={showOutages}
            showWorkOrders={showWorkOrders}
            outageFilters={outageFilters}
            onOutageFiltersChange={patchOutageFilters}
            workOrderFilters={workOrderFilters}
            onWorkOrderFiltersChange={patchWorkOrderFilters}
            outageTruncated={outageData?.truncated ?? false}
            workOrderTruncated={workOrderData?.truncated ?? false}
          />
        )}

        {activeTool === 'area' && (
          <AreaSelectPanel
            onClose={() => setActiveTool(undefined)}
            isDrawing={isAreaDrawing}
            hasArea={area.polygon !== null}
            onClearArea={clearArea}
          />
        )}

        <div className={styles.railColumn}>
          {mapZoomApi && <MapZoomControl onZoomIn={mapZoomApi.zoomIn} onZoomOut={mapZoomApi.zoomOut} />}
          <MapToolRail
            activeTool={activeTool}
            onToggleTool={(tool) => setActiveTool((prev) => (prev === tool ? undefined : tool))}
          />
        </div>
      </div>

      {/* Etki önizlemesi ve kayıt formu TEK modalde — istek `POST /outages` (ya da
          `/work-orders`) ucuna aynı doğrulamalarla gider. */}
      {action && selectedComponent && (
        <CreateOperationDialog component={selectedComponent} kind={action} onClose={() => setAction(undefined)} />
      )}
    </div>
  );
}
