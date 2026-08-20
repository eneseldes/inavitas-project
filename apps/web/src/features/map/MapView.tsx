import {
  Map as MapLibreMap,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '../../features/theme/ThemeProvider.tsx';
import type { Bbox, VoltageLevel } from '../../types/network.ts';
import type { OutageMapItem } from '../../types/outage.ts';
import type { WorkOrderMapItem } from '../../types/work-order.ts';
import { BASEMAP_PMTILES_URL, BASEMAP_SOURCE_ID, buildBasemapLayers, isBasemapAvailable, registerPmtilesProtocol } from './basemap.ts';
import type { TraceDirection } from './api.ts';
import { addClusterImage, registerMarkerImages } from './markerIcons.ts';
import type { MapView as MapViewState } from './useMapState.ts';
import { useUnitLabels } from './useNetwork.ts';
import {
  buildingFilters,
  buildNetworkLayers,
  buildNetworkSource,
  CLICKABLE_LAYER_IDS,
  componentFilters,
  emphasisVisibility,
  legendVisibility,
  NETWORK_SOURCE_ID,
  SELECTABLE_SOURCE_LAYERS,
  unitFillOpacity,
  UNITS_DISTRICT_FILL_LAYER_ID,
  UNITS_PROVINCE_FILL_LAYER_ID,
  type LegendId,
} from './networkLayers.ts';
import {
  buildHeatSource,
  buildOperationLayers,
  buildOperationSource,
  buildOutageHeatmapLayer,
  operationLayerIds,
  OUTAGE_HEAT_SOURCE_ID,
  OUTAGE_HEATMAP_LAYER_ID,
  OUTAGE_SOURCE_ID,
  toOutageCollection,
  toWorkOrderCollection,
  WORK_ORDER_SOURCE_ID,
} from './operationLayers.ts';
import { PolygonDrawController } from './polygonDraw.ts';
import {
  buildUnitLabelLayers,
  registerUnitLabelImages,
  toUnitLabelCollection,
  UNIT_LABEL_LAYER_IDS,
  UNIT_LABEL_SOURCE_ID,
  type UnitLabelSet,
} from './unitLabels.ts';
import styles from './MapView.module.scss';

/** Zoom düğmelerinin çağırdığı asgari yüzey — kontrol MapPage'te ayrı bir bileşen olarak çizilir. */
export interface MapZoomApi {
  zoomIn: () => void;
  zoomOut: () => void;
}

interface MapViewProps {
  view: MapViewState;
  onViewChange: (view: MapViewState) => void;
  legend: Set<LegendId>;
  voltageLevels: Set<VoltageLevel>;
  showAdminBoundaries: boolean;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  flyTo?: { lng: number; lat: number; zoom: number };
  /**
   * Açık izdeki eleman kimlikleri ve yönü. İz ayrı bir katman üretmez; bu kimliklerin
   * `feature-state`'i boyanır (bkz. networkLayers.ts iz ifadeleri).
   */
  tracedIds: string[] | undefined;
  traceDirection: TraceDirection | undefined;
  /**
   * İzin kapsayan dikdörtgeni — sunucu tek `ST_Extent` sorgusuyla döner. Geldiğinde kamera
   * buraya oturur; iz kapanınca kullanıcının seçimden önceki konumuna geri döner.
   */
  traceBbox: Bbox | null | undefined;
  /**
   * Görünüm penceresindeki enerjisiz eleman kimlikleri. İzle aynı mekanizma: ayrı katman
   * üretilmez, bu kimliklerin `feature-state`'i boyanır. Enerji durumu tile'a **gömülmez** —
   * gömülseydi her manevrada tüm tile önbelleği boşalırdı.
   */
  deEnergizedIds: string[] | undefined;
  /** Kesintinin kökü olan kesiciler — "açık kontak" olarak çizilir (içi boş + kırmızı kontur). */
  openSwitchIds: string[] | undefined;
  /** Efsanedeki "Enerjisiz Bölgeler" satırı kapalıysa durum hiç yazılmaz. */
  showDeEnergized: boolean;
  /** Kamera durduğunda görünüm penceresi yukarı bildirilir — enerjisizlik sorgusu bbox kapsamlı. */
  onViewportChange?: (bbox: Bbox, zoom: number) => void;
  /** İşletim katmanları — `/outages/map` ve `/work-orders/map` özetleri. */
  outages: OutageMapItem[] | undefined;
  workOrders: WorkOrderMapItem[] | undefined;
  showOutages: boolean;
  showWorkOrders: boolean;
  showOutageHeatmap: boolean;
  /** Sol paneldeki listede seçili kayıt — işaretçisi büyütülerek gösterilir. */
  selectedOperationId: string | undefined;
  /** Haritadaki bir kesinti/iş emri noktasına tıklandığında çağrılır. */
  onSelectOperation: (kind: 'outage' | 'workOrder', id: string) => void;
  /** Alan seçimi: çizim modu açık mı, çizilmiş poligon ve tamamlanma bildirimi. */
  isAreaDrawing: boolean;
  areaPolygon: Polygon | null;
  onAreaDrawn: (polygon: Polygon) => void;
  onAreaDrawingChange: (isDrawing: boolean) => void;
  /** Harita kurulur kurulmaz bir kez çağrılır — zoom kontrolü haritanın DIŞINDA (MapPage'te,
   * araç şeridiyle aynı sütunda) çizildiği için oraya `zoomIn`/`zoomOut` böyle ulaşır. */
  onMapReady?: (api: MapZoomApi) => void;
}

registerPmtilesProtocol();

const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

/** Türkiye odaklı — batıda Yunanistan, doğuda Azerbaycan'a kadar; kaydırma bunun dışına çıkamaz. */
const TURKEY_MAX_BOUNDS: [[number, number], [number, number]] = [
  [18, 33],
  [51, 45],
];

/**
 * DetailPanel'in harita üstünde kapladığı sol şerit: `.dockLeft`in sol boşluğu (12px) +
 * panelin genişliği (20rem = 320px), bkz. MapPage.module.scss / DetailPanel.module.scss.
 * İz sığdırmasının sol dolgusu bunu 64px'lik standart dolguya EKLER.
 */
const DETAIL_PANEL_LEFT_INSET_PX = 64 + 12 + 320;

/**
 * `maxBounds` kurulu bir haritaya bunun dışında bir `center` verilirse MapLibre kuruluşu
 * sessizce başarısız olur (hiç tile isteği atılmaz, harita boş kalır) — ör. eski/bozuk bir
 * URL'den `?lng=&lat=` gelirse. İlk kamera her zaman sınırın içinde kalsın diye kırpılır.
 */
function clampToBounds(lng: number, lat: number): [number, number] {
  const [[minLng, minLat], [maxLng, maxLat]] = TURKEY_MAX_BOUNDS;
  return [Math.min(Math.max(lng, minLng), maxLng), Math.min(Math.max(lat, minLat), maxLat)];
}

/** MapLibre örneği React render döngüsünün dışında yaşar — her render'da yeniden kurulmaz. */
export function MapView({
  view,
  onViewChange,
  legend,
  voltageLevels,
  showAdminBoundaries,
  selectedId,
  onSelect,
  flyTo,
  outages,
  workOrders,
  showOutages,
  showWorkOrders,
  showOutageHeatmap,
  selectedOperationId,
  onSelectOperation,
  tracedIds,
  traceDirection,
  traceBbox,
  deEnergizedIds,
  openSwitchIds,
  showDeEnergized,
  onViewportChange,
  isAreaDrawing,
  areaPolygon,
  onAreaDrawn,
  onAreaDrawingChange,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const { theme } = useTheme();
  /**
   * Katmanlar her kurulduğunda artar. Görünürlük/filtre efektleri buna bağlıdır, `mapLoaded`
   * bayrağına değil: katmanlar yalnız ilk açılışta değil, tema değiştiğinde ve işaretçi
   * görselleri yüklendikten sonra da yeniden kurulur. Sayaç artmazsa yeni kurulan katmanlar
   * varsayılan (hepsi görünür, filtresiz) hâlde kalır.
   */
  const [layersVersion, setLayersVersion] = useState(0);

  const { data: unitLabels } = useUnitLabels();
  const unitLabelsRef = useRef(unitLabels);
  unitLabelsRef.current = unitLabels;
  // Önceki seçimin `feature-state`'ini temizleyebilmek için tutulur.
  const selectedFeatureRef = useRef<string | undefined>(undefined);
  // Aynısının iz karşılığı — iz kapanınca boyanmış her kimlik tek tek geri alınır.
  const tracedFeatureIdsRef = useRef<string[]>([]);
  // Enerjisizlik karşılığı; kesinti bitince ya da pencere değişince tek tek temizlenir.
  const energizedFeatureIdsRef = useRef<string[]>([]);
  const openSwitchFeatureIdsRef = useRef<string[]>([]);
  // İz açılmadan önceki kamera; iz kapanınca buraya dönülür.
  const savedCameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const drawRef = useRef<PolygonDrawController | null>(null);

  // Mount efektindeki `moveend`/click dinleyicileri harita örneğiyle birlikte YALNIZ BİR KEZ
  // kurulur (bkz. aşağıdaki `[]` bağımlılık listesi) ve asla yeniden bağlanmaz. Bu yüzden
  // `onViewChange`/`onSelect`'i doğrudan kapatırlarsa kurulum anındaki (URL'de henüz hiçbir
  // filtre yokken) sürümde donarlar: sonraki her pan/zoom veya tıklama, o ilk `searchParams`
  // taban alınarak `patch` çağırır ve o ana kadar değiştirilmiş tüm filtreleri (gerilim,
  // efsane, seçim) URL'den siler. Ref'ler her render'da güncel tutulup dinleyiciler ref
  // üzerinden çağrılarak her zaman en güncel URL durumunun üstüne yazılması sağlanır.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectOperationRef = useRef(onSelectOperation);
  onSelectOperationRef.current = onSelectOperation;
  const onAreaDrawnRef = useRef(onAreaDrawn);
  onAreaDrawnRef.current = onAreaDrawn;
  const onAreaDrawingChangeRef = useRef(onAreaDrawingChange);
  onAreaDrawingChangeRef.current = onAreaDrawingChange;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  // Kesinti/iş emri verisi katmanlar kurulmadan da gelebilir; son hâli burada tutulur ki
  // tema değişiminde katmanlar yeniden kurulurken veri kaybolmasın.
  const outagesRef = useRef(outages);
  outagesRef.current = outages;
  const workOrdersRef = useRef(workOrders);
  workOrdersRef.current = workOrders;
  const selectedOperationIdRef = useRef(selectedOperationId);
  selectedOperationIdRef.current = selectedOperationId;

  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap | undefined;
    let cancelled = false;
    /**
     * Sayfa değişirken konteyner küçülür; MapLibre'nin `ResizeObserver`'ı buna `moveend`
     * ile karşılık verir. O anda `onViewChange` çağrılırsa `setSearchParams` yeni rotanın
     * üstüne `/map?...` yazar ve kullanıcı haritadan çıkamaz — "ilk tıklamada geçmiyor,
     * ikincide geçiyor" davranışının sebebi buydu. Sökülme başladıktan sonra kamera
     * olayları yok sayılır.
     */
    let disposed = false;

    // Mount anında konteynerin flex düzeni henüz oturmamış olabilir (genişlik 0) — MapLibre
    // sıfır genişlikle kurulursa kamera durumu kalıcı olarak bozulur.
    const frame = requestAnimationFrame(() => {
      if (cancelled || !containerRef.current) return;

      map = new MapLibreMap({
        container: containerRef.current,
        style: EMPTY_STYLE,
        center: clampToBounds(view.lng, view.lat),
        zoom: view.zoom,
        maxBounds: TURKEY_MAX_BOUNDS,
        attributionControl: false,
        // MapLibre'nin sembol yerleşim motoru, harita "idle" olduktan SONRA her simge
        // görünüşünde/kayboluşunda kendi ~300ms solmasını uygular — bu, katman
        // paint'indeki `icon-opacity-transition: { duration: 0 }` (bkz. operationLayers.ts)
        // TARAFINDAN KAPATILAMAZ, ayrı bir mekanizmadır. Kesinti/iş emri rozetleri (harita
        // üzerindeki TEK sembol katmanları) bu yüzden solarak belirip kayboluyordu; bazen de
        // bir sonraki render kare'si gelmediği için solma yarım kalmış gibi hiç görünmüyordu.
        // İl/ilçe dolgusunun kasıtlı solması (`fill-opacity-transition`) bambaşka bir
        // mekanizmadır ve bundan ETKİLENMEZ.
        fadeDuration: 0,
      });
      mapRef.current = map;
      onMapReadyRef.current?.({ zoomIn: () => map!.zoomIn(), zoomOut: () => map!.zoomOut() });

      map.on('moveend', () => {
        if (disposed) return;
        // Sürüklemenin ataleti (inertia) tıklamadan uzun süre sonra durabilir. Kullanıcı bu
        // arada başka bir sayfaya tıklamışsa `navigate()` `history`'i ZATEN değiştirmiştir
        // ama React'in unmount'u (ve `disposed=true`'yu) commit etmesi bir sonraki render'a
        // kadar gecikebilir. O gecikmiş pencerede ateşlenen bu `moveend` `replace: true` ile
        // yazınca kullanıcıyı gittiği sayfadan HARİTAYA geri fırlatıyordu — konum artık
        // `/map` değilse bu yazım burada sessizce atlanır.
        if (!window.location.pathname.startsWith('/map')) return;
        const center = map!.getCenter();
        onViewChangeRef.current({ lng: center.lng, lat: center.lat, zoom: map!.getZoom() });

        // Enerjisizlik sorgusu görünüm penceresi kapsamlıdır (`setFeatureState` yalnız yüklü
        // tile'lara yazılabilir), o yüzden pencere her durduğunda yukarı bildirilir. Yukarıdaki
        // "haritadan çıkamama" koruması bu bildirimi de kapsar — bilerek aynı bloktadır.
        const b = map!.getBounds();
        onViewportChangeRef.current?.(
          [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
          map!.getZoom(),
        );
      });

      // Küme rozetleri her sayı için ayrı bir görseldir; sayı sınırsız olduğundan hepsi
      // önceden kaydedilemez, MapLibre eksik olanı bu olayla ister.
      map.on('styleimagemissing', (e) => addClusterImage(map!, e.id));

      /**
       * Seçim kuralı: bir birime tıklamak **binayı** seçer. Tek istisna TM'dir — orada
       * birden çok fider çıkışı olduğu için kesiciler tek tek seçilebilir. DM, trafo ve
       * kofrada tek kesici vardır, oraya tıklamak da birimin kendisini seçer.
       */
      const handleFeatureClick = (e: MapLayerMouseEvent) => {
        // Alan çizerken tıklama köşe ekler; aynı tıklama bir de eleman seçmemeli.
        if (drawRef.current?.isDrawing) return;
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const unitId = props.unit_id as string | undefined;
        const unitType = props.unit_type as string | undefined;
        const ownId = props.id as string | undefined;
        const id = unitId !== undefined && unitType !== 'TM' ? unitId : ownId;
        if (id) onSelectRef.current(id);
      };
      for (const layerId of CLICKABLE_LAYER_IDS) {
        map.on('click', layerId, handleFeatureClick);
        map.on('mouseenter', layerId, () => {
          // Çizim modunda imleç artı işaretidir; katman üstüne gelmek onu bozmamalı.
          if (drawRef.current?.isDrawing) return;
          map!.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          if (drawRef.current?.isDrawing) return;
          map!.getCanvas().style.cursor = '';
        });
      }

      // İşletim katmanları ayrı bir tıklama kuralı izler: nokta bir şebeke elemanını
      // değil, bir kesinti/iş emri kaydını temsil eder.
      //
      // İş emri ÖNCE, kesinti SONRA kaydedilir: bir kesinti açıldığında aynı konumda
      // otomatik bir iş emri de oluşuyor, ikisi tam aynı noktada üst üste biniyor. MapLibre
      // her katmanın delege tıklama dinleyicisini BAĞIMSIZ çalıştırır — aynı tıklama ikisini
      // de tetikler ve SON çalışan seçimi ezer. Kesinti zaten üstte ÇİZİLİYOR (aşağıdaki
      // `buildOperationLayers` çağrı sırasına bkz.); tıklama da görsel sırayla tutarlı olsun
      // diye kesinti dinleyicisi en son kaydedilir ki son çalışan (kazanan) o olsun.
      for (const sourceId of [WORK_ORDER_SOURCE_ID, OUTAGE_SOURCE_ID]) {
        const kind = sourceId === OUTAGE_SOURCE_ID ? 'outage' : 'workOrder';
        for (const layerId of operationLayerIds(sourceId)) {
          map.on('click', layerId, (e: MapLayerMouseEvent) => {
            if (drawRef.current?.isDrawing) return;
            const feature = e.features?.[0];
            if (!feature) return;

            // Kümeye tıklamak kümeyi açar: rozetin altında kaç kayıt olduğu ancak
            // yakınlaşınca görülür, tıklamanın anlamı da budur.
            const clusterId = feature.properties?.cluster_id as number | undefined;
            if (clusterId !== undefined) {
              const source = map!.getSource(sourceId) as GeoJSONSource | undefined;
              void source?.getClusterExpansionZoom(clusterId).then((zoom) => {
                map!.easeTo({ center: e.lngLat, zoom });
              });
              return;
            }

            const id = feature.properties?.id as string | undefined;
            if (id) onSelectOperationRef.current(kind, id);
          });
          map.on('mouseenter', layerId, () => {
            if (drawRef.current?.isDrawing) return;
            map!.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layerId, () => {
            if (drawRef.current?.isDrawing) return;
            map!.getCanvas().style.cursor = '';
          });
        }
      }

      map.on('load', () => {
        loadedRef.current = true;
        // İlk pencere `moveend` beklemeden bildirilir — kullanıcı haritayı hiç oynatmazsa
        // enerjisizlik sorgusu hiç açılmazdı.
        const initial = map!.getBounds();
        onViewportChangeRef.current?.(
          [initial.getWest(), initial.getSouth(), initial.getEast(), initial.getNorth()],
          map!.getZoom(),
        );
        drawRef.current = new PolygonDrawController(map!, {
          onComplete: (polygon) => onAreaDrawnRef.current(polygon),
          onDrawingChange: (drawing) => onAreaDrawingChangeRef.current(drawing),
        });
        void rebuildLayers(map!, theme, {
          outages: outagesRef.current,
          workOrders: workOrdersRef.current,
          selectedOperationId: selectedOperationIdRef.current,
          draw: drawRef.current,
          unitLabels: unitLabelsRef.current,
        }).then(() => setLayersVersion((version) => version + 1));
      });
    });

    return () => {
      cancelled = true;
      disposed = true;
      cancelAnimationFrame(frame);
      loadedRef.current = false;
      drawRef.current?.destroy();
      drawRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema değişince tüm katmanlar yeniden kurulur — token'lar düz renk değerine yalnız
  // katman oluşturulurken çözülüyor, canlı `var()` desteklenmiyor. İşaretçi görselleri de
  // token'lardan boyandığı için onlar da yeniden üretilir.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    void rebuildLayers(map, theme, {
      outages: outagesRef.current,
      workOrders: workOrdersRef.current,
      selectedOperationId: selectedOperationIdRef.current,
      draw: drawRef.current,
      unitLabels: unitLabelsRef.current,
    }).then(() => setLayersVersion((version) => version + 1));
    // Ad verisi sorgudan sonra geldiği için bağımlılıkta: ilk kurulumda henüz yoksa
    // katmanları da eklenmemiş olur, geldiğinde bir kez daha kurulur.
  }, [theme, unitLabels]);

  // Kesinti/iş emri verisi değişince katman kurulmaz, yalnız kaynağın verisi güncellenir —
  // SSE her olayda katmanları yeniden kursaydı harita her olayda bir an boşalırdı.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;
    const collection = toOutageCollection(outages, selectedOperationId);
    (map.getSource(OUTAGE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(collection);
    (map.getSource(OUTAGE_HEAT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(collection);
  }, [outages, selectedOperationId, layersVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;
    (map.getSource(WORK_ORDER_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      toWorkOrderCollection(workOrders, selectedOperationId),
    );
  }, [workOrders, selectedOperationId, layersVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;

    const apply = (layerIds: string[], visible: boolean) => {
      for (const layerId of layerIds) {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };
    apply(operationLayerIds(OUTAGE_SOURCE_ID), showOutages);
    apply(operationLayerIds(WORK_ORDER_SOURCE_ID), showWorkOrders);
    // Isı haritası kesinti katmanından bağımsız açılıp kapanır.
    apply([OUTAGE_HEATMAP_LAYER_ID], showOutageHeatmap);
  }, [showOutages, showWorkOrders, showOutageHeatmap, layersVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;
    for (const { layerId, visible } of legendVisibility(legend)) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
    for (const { layerId, filter } of buildingFilters(legend)) {
      if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    }
  }, [legend, layersVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;
    for (const { layerId, filter } of componentFilters(voltageLevels)) {
      if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    }
  }, [voltageLevels, layersVersion]);

  // `visibility` (layout özelliği) yerine `fill-opacity` (paint özelliği) kullanılır:
  // katman kapatılıp açılırken de solarak kaybolsun/belirsin istendi — `visibility` bir
  // geçişle animasyonlanamaz, yalnız paint özellikleri `-transition` ile solar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0 || !map.getLayer(UNITS_PROVINCE_FILL_LAYER_ID)) return;
    map.setPaintProperty(
      UNITS_PROVINCE_FILL_LAYER_ID,
      'fill-opacity',
      showAdminBoundaries ? unitFillOpacity(theme, 'province') : 0,
    );
    map.setPaintProperty(
      UNITS_DISTRICT_FILL_LAYER_ID,
      'fill-opacity',
      showAdminBoundaries ? unitFillOpacity(theme, 'district') : 0,
    );
  }, [showAdminBoundaries, layersVersion, theme]);

  // --- Alan seçimi ------------------------------------------------------------

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || layersVersion === 0) return;
    if (isAreaDrawing && !draw.isDrawing) draw.start();
    if (!isAreaDrawing && draw.isDrawing) draw.cancel();
  }, [isAreaDrawing, layersVersion]);

  // Çizilmiş poligonun sahibi sayfa durumudur; harita onu yalnız çizer.
  useEffect(() => {
    if (layersVersion === 0) return;
    drawRef.current?.setPolygon(areaPolygon);
  }, [areaPolygon, layersVersion]);

  // Seçim `feature-state` ile gösterilir: bina izinin dolgusu koyulaşır, düğüm/kesici
  // vurgulanır. Çizilen geometrinin kendisi boyandığı için ayrı bir seçim geometrisi yok.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;

    const previous = selectedFeatureRef.current;
    if (previous) {
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.removeFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id: previous }, 'selected');
      }
      selectedFeatureRef.current = undefined;
    }
    if (selectedId !== undefined) {
      // Hangi kaynak katmanda olduğu bilinmediğinden hepsine yazılır; olmayan tarafta
      // `feature-state` sessizce boşa gider.
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.setFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id: selectedId }, { selected: true });
      }
      selectedFeatureRef.current = selectedId;
    }
  }, [selectedId, layersVersion]);

  // İz vurgusu — seçimle aynı mekanizma (`feature-state`), ayrı bir katman üretilmez.
  // Önceki iz her seferinde tek tek temizlenir: `removeFeatureState` kaynağın tamamını
  // sıfırlayabilirdi ama o seçimi de silerdi.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;

    for (const id of tracedFeatureIdsRef.current) {
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.removeFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id }, 'traced');
      }
    }
    tracedFeatureIdsRef.current = [];

    if (!tracedIds || !traceDirection) return;
    for (const id of tracedIds) {
      // Hangi kaynak katmanda olduğu bilinmediğinden hepsine yazılır; olmayan tarafta
      // `feature-state` sessizce boşa gider (seçimde de aynı desen kullanılıyor).
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.setFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id }, { traced: traceDirection });
      }
    }
    tracedFeatureIdsRef.current = tracedIds;
  }, [tracedIds, traceDirection, layersVersion]);

  // Enerjisizlik — izle birebir aynı desen. `layersVersion` bağımlılıkta: tema değişiminde
  // katmanlar yeniden kurulur ve durumlar yeniden yazılmazsa enerjisizlik sessizce kaybolur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;

    // Tek tek temizlenir; kaynağın tamamını sıfırlamak seçimi ve izi de silerdi.
    for (const id of energizedFeatureIdsRef.current) {
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.removeFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id }, 'energized');
      }
    }
    for (const id of openSwitchFeatureIdsRef.current) {
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.removeFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id }, 'switchOpen');
      }
    }
    energizedFeatureIdsRef.current = [];
    openSwitchFeatureIdsRef.current = [];

    if (!showDeEnergized) return;

    for (const id of deEnergizedIds ?? []) {
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.setFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id }, { energized: false });
      }
    }
    for (const id of openSwitchIds ?? []) {
      for (const sourceLayer of SELECTABLE_SOURCE_LAYERS) {
        map.setFeatureState({ source: NETWORK_SOURCE_ID, sourceLayer, id }, { switchOpen: true });
      }
    }

    energizedFeatureIdsRef.current = deEnergizedIds ?? [];
    openSwitchFeatureIdsRef.current = openSwitchIds ?? [];
  }, [deEnergizedIds, openSwitchIds, showDeEnergized, layersVersion]);

  // Kesikli enerjisizlik katmanları yalnız efsane satırı açıkken VE enerjisiz küme boş
  // değilken açılır (bkz. `emphasisVisibility` — performans notu orada).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;

    const hasEmphasis = showDeEnergized && (deEnergizedIds?.length ?? 0) > 0;

    for (const { layerId, visible } of emphasisVisibility(legend, hasEmphasis)) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }, [deEnergizedIds, showDeEnergized, legend, layersVersion]);

  // Harita odağı: iz açılınca kamera izin kapsayan dikdörtgenine oturur, iz kapanınca
  // kullanıcının seçimden ÖNCEKİ konumuna geri döner. Ayrı bir "temizle" butonuna
  // bağlanmaz — unutulursa harita yanlış konumda takılı kalmış gibi hissedilir.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;

    if (traceBbox) {
      savedCameraRef.current ??= { center: map.getCenter().toArray(), zoom: map.getZoom() };
      // İz düğmeleri yalnız DetailPanel içinde durur, yani `traceBbox` geldiğinde panel
      // HER ZAMAN açıktır ve haritanın sol şeridini (bkz. DetailPanel.module.scss `.panel`
      // genişliği + MapPage.module.scss `.dockLeft` boşluğu) üstüne biner. Simetrik dolgu
      // bunu hesaba katmazsa bulunan eleman panelin arkasında kalır — sol dolgu o kadar artırılır.
      const leftPadding = selectedId !== undefined ? DETAIL_PANEL_LEFT_INSET_PX : 64;
      // `maxZoom` olmadan tek elemanlı bir iz (kofra kesicisi → 0 eleman) sonuna kadar
      // yakınlaşıp bağlamı tamamen kaybettiriyor.
      map.fitBounds(traceBbox, { padding: { top: 64, bottom: 64, left: leftPadding, right: 64 }, maxZoom: 17, duration: 600 });
      return;
    }

    const saved = savedCameraRef.current;
    if (saved) {
      map.easeTo({ center: saved.center, zoom: saved.zoom, duration: 600 });
      savedCameraRef.current = null;
    }
    // `traceBbox` dizi kimliği her render'da değişebileceğinden içeriğine göre bağımlanılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceBbox?.join(','), layersVersion, selectedId]);

  // İl/ilçe adları — kaynak ve görseller `rebuildLayers` içinde kurulur; burada yalnız
  // idari sınır anahtarına göre görünürlük sürülür (dolgularla aynı anahtar).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layersVersion === 0) return;

    for (const layerId of UNIT_LABEL_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', showAdminBoundaries ? 'visible' : 'none');
      }
    }
  }, [showAdminBoundaries, layersVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: clampToBounds(flyTo.lng, flyTo.lat), zoom: flyTo.zoom });
  }, [flyTo]);

  return <div ref={containerRef} className={styles.container} />;
}

interface RebuildInput {
  outages: OutageMapItem[] | undefined;
  workOrders: WorkOrderMapItem[] | undefined;
  selectedOperationId: string | undefined;
  draw: PolygonDrawController | null;
  unitLabels: UnitLabelSet | undefined;
}

/** Mevcut basemap + şebeke + işletim katmanlarını kaldırıp güncel tema token'larıyla yeniden kurar. */
async function rebuildLayers(map: MapLibreMap, theme: 'light' | 'dark', input: RebuildInput): Promise<void> {
  const ownedSources = [
    NETWORK_SOURCE_ID,
    UNIT_LABEL_SOURCE_ID,
    OUTAGE_SOURCE_ID,
    WORK_ORDER_SOURCE_ID,
    OUTAGE_HEAT_SOURCE_ID,
  ];
  const style = map.getStyle();
  if (style) {
    for (const layer of style.layers) {
      if ('source' in layer && ownedSources.includes(layer.source as string)) map.removeLayer(layer.id);
    }
  }
  for (const sourceId of ownedSources) {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
  removeBasemap(map);

  // Katman sırası: altlık harita → il/ilçe renkleri → il/ilçe adları → hatlar → bina izi →
  // düğümler → çizim poligonu → ısı haritası → kesinti/iş emri işaretçileri (en üstte).
  map.addSource(NETWORK_SOURCE_ID, buildNetworkSource());
  const layers = buildNetworkLayers(theme);
  for (const layer of layers) map.addLayer(layer);
  const firstLayerId = layers[0]!.id;

  // Adlar il/ilçe dolgularının hemen üstüne, hatların altına girer: eskiden HTML işaretçisi
  // oldukları için her şeyin üstünde duruyor ve elemanların üstünü kapatıyorlardı.
  if (input.unitLabels) {
    const beforeLineLayerId = layers.find(
      (layer) => layer.id !== UNITS_PROVINCE_FILL_LAYER_ID && layer.id !== UNITS_DISTRICT_FILL_LAYER_ID,
    )?.id;
    registerUnitLabelImages(map, input.unitLabels);
    map.addSource(UNIT_LABEL_SOURCE_ID, { type: 'geojson', data: toUnitLabelCollection(input.unitLabels) });
    for (const layer of buildUnitLabelLayers()) map.addLayer(layer, beforeLineLayerId);
  }

  // Çizim katmanları işaretçilerin altında kalır: yarı saydam dolgu, üstüne binerse
  // rozetleri soluklaştırırdı.
  input.draw?.syncLayers();

  const outageCollection = toOutageCollection(input.outages, input.selectedOperationId);
  map.addSource(OUTAGE_SOURCE_ID, buildOperationSource(outageCollection));
  map.addSource(OUTAGE_HEAT_SOURCE_ID, buildHeatSource(outageCollection));
  map.addSource(WORK_ORDER_SOURCE_ID, buildOperationSource(toWorkOrderCollection(input.workOrders, input.selectedOperationId)));
  map.addLayer(buildOutageHeatmapLayer());

  // İşaretçi görselleri katmanlardan ÖNCE kaydedilir; yoksa MapLibre "görsel yok" uyarısı
  // basıp bir kare boyunca boş çizer.
  await registerMarkerImages(map).catch(() => undefined);
  // Bu arada harita sökülmüş olabilir (sayfa değişimi) — kaynak yoksa katman da eklenmez.
  if (!map.getSource(WORK_ORDER_SOURCE_ID)) return;
  for (const layer of buildOperationLayers(WORK_ORDER_SOURCE_ID, 'workOrder')) map.addLayer(layer);
  for (const layer of buildOperationLayers(OUTAGE_SOURCE_ID, 'outage')) map.addLayer(layer);

  const available = await isBasemapAvailable();
  if (!map.getSource(NETWORK_SOURCE_ID)) return;

  if (available) {
    map.addSource(BASEMAP_SOURCE_ID, { type: 'vector', url: `pmtiles://${window.location.origin}${BASEMAP_PMTILES_URL}` });
    for (const layer of buildBasemapLayers(theme)) map.addLayer(layer, firstLayerId);
    return;
  }

  const rasterTiles = theme === 'dark'
    ? [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ]
    : [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ];

  map.addSource(BASEMAP_SOURCE_ID, {
    type: 'raster',
    tiles: rasterTiles,
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  });
  map.addLayer(
    {
      id: 'basemap-raster-layer',
      type: 'raster',
      source: BASEMAP_SOURCE_ID,
      paint: { 'raster-opacity': theme === 'dark' ? 0.85 : 0.95 },
    },
    firstLayerId,
  );
}

function removeBasemap(map: MapLibreMap): void {
  const style = map.getStyle();
  if (!style) return;
  for (const layer of style.layers) {
    if ('source' in layer && layer.source === BASEMAP_SOURCE_ID) map.removeLayer(layer.id);
  }
  if (map.getSource(BASEMAP_SOURCE_ID)) map.removeSource(BASEMAP_SOURCE_ID);
}
