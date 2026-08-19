import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '../../features/theme/ThemeProvider.tsx';
import type { Bbox, VoltageLevel } from '../../types/network.ts';
import type { OutageMapItem } from '../../types/outage.ts';
import type { WorkOrderMapItem } from '../../types/work-order.ts';
import { BASEMAP_PMTILES_URL, BASEMAP_SOURCE_ID, buildBasemapLayers, isBasemapAvailable, registerPmtilesProtocol } from './basemap.ts';
import type { TraceDirection } from './api.ts';
import type { MapView as MapViewState } from './useMapState.ts';
import { useUnitLabels } from './useNetwork.ts';
import {
  buildingFilters,
  buildNetworkLayers,
  buildNetworkSource,
  CLICKABLE_LAYER_IDS,
  componentFilters,
  legendVisibility,
  NETWORK_SOURCE_ID,
  SELECTABLE_SOURCE_LAYERS,
  UNITS_DISTRICT_FILL_LAYER_ID,
  UNITS_PROVINCE_FILL_LAYER_ID,
  type LegendId,
} from './networkLayers.ts';
import {
  buildOperationLayers,
  buildOperationSource,
  buildOutageHeatmapLayer,
  operationLayerIds,
  OUTAGE_HEATMAP_LAYER_ID,
  OUTAGE_SOURCE_ID,
  toOutageCollection,
  toWorkOrderCollection,
  WORK_ORDER_SOURCE_ID,
} from './operationLayers.ts';
import styles from './MapView.module.scss';

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
  /** İşletim katmanları — `/outages/map` ve `/work-orders/map` özetleri. */
  outages: OutageMapItem[] | undefined;
  workOrders: WorkOrderMapItem[] | undefined;
  showOutages: boolean;
  showWorkOrders: boolean;
  showOutageHeatmap: boolean;
  /** Haritadaki bir kesinti/iş emri noktasına tıklandığında çağrılır. */
  onSelectOperation: (kind: 'outage' | 'workOrder', id: string) => void;
}

registerPmtilesProtocol();

const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

/** Türkiye odaklı — batıda Yunanistan, doğuda Azerbaycan'a kadar; kaydırma bunun dışına çıkamaz. */
const TURKEY_MAX_BOUNDS: [[number, number], [number, number]] = [
  [18, 33],
  [51, 45],
];

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
  onSelectOperation,
  tracedIds,
  traceDirection,
  traceBbox,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const { theme } = useTheme();
  // Katman senkron efektleri `loadedRef`'e değil buna bağlıdır — 'load' olayı mount efektinin
  // dışında, React render döngüsü dışında ateşlenir; bir ref güncellemesi tek başına bu
  // efektleri yeniden tetiklemez. URL'den gelen ilk filtre durumu bu state sayesinde uygulanır.
  const [mapLoaded, setMapLoaded] = useState(false);

  const { data: unitLabels } = useUnitLabels();
  const labelMarkersRef = useRef<Marker[]>([]);
  // Önceki seçimin `feature-state`'ini temizleyebilmek için tutulur.
  const selectedFeatureRef = useRef<string | undefined>(undefined);
  // Aynısının iz karşılığı — iz kapanınca boyanmış her kimlik tek tek geri alınır.
  const tracedFeatureIdsRef = useRef<string[]>([]);
  // İz açılmadan önceki kamera; iz kapanınca buraya dönülür.
  const savedCameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

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
  // Kesinti/iş emri verisi katmanlar kurulmadan da gelebilir; son hâli burada tutulur ki
  // tema değişiminde katmanlar yeniden kurulurken veri kaybolmasın.
  const outagesRef = useRef(outages);
  outagesRef.current = outages;
  const workOrdersRef = useRef(workOrders);
  workOrdersRef.current = workOrders;

  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap | undefined;
    let cancelled = false;

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
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

      map.on('moveend', () => {
        const center = map!.getCenter();
        onViewChangeRef.current({ lng: center.lng, lat: center.lat, zoom: map!.getZoom() });
      });

      /**
       * Seçim kuralı: bir birime tıklamak **binayı** seçer. Tek istisna TM'dir — orada
       * birden çok fider çıkışı olduğu için kesiciler tek tek seçilebilir. DM, trafo ve
       * kofrada tek kesici vardır, oraya tıklamak da birimin kendisini seçer.
       */
      const handleFeatureClick = (e: MapLayerMouseEvent) => {
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
          map!.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map!.getCanvas().style.cursor = '';
        });
      }

      // İşletim katmanları ayrı bir tıklama kuralı izler: nokta bir şebeke elemanını
      // değil, bir kesinti/iş emri kaydını temsil eder.
      for (const layerId of [...operationLayerIds(OUTAGE_SOURCE_ID), ...operationLayerIds(WORK_ORDER_SOURCE_ID)]) {
        const kind = layerId.startsWith(OUTAGE_SOURCE_ID) ? 'outage' : 'workOrder';
        map.on('click', layerId, (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) onSelectOperationRef.current(kind, id);
        });
        map.on('mouseenter', layerId, () => {
          map!.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map!.getCanvas().style.cursor = '';
        });
      }

      map.on('load', () => {
        loadedRef.current = true;
        rebuildLayers(map!, theme, outagesRef.current, workOrdersRef.current);
        setMapLoaded(true);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      loadedRef.current = false;
      setMapLoaded(false);
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema değişince tüm katmanlar yeniden kurulur — token'lar düz renk değerine yalnız
  // katman oluşturulurken çözülüyor, canlı `var()` desteklenmiyor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    rebuildLayers(map, theme, outagesRef.current, workOrdersRef.current);
  }, [theme]);

  // Kesinti/iş emri verisi değişince katman kurulmaz, yalnız kaynağın verisi güncellenir —
  // SSE her olayda katmanları yeniden kurmasın diye.
  useEffect(() => {
    const source = mapRef.current?.getSource(OUTAGE_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(toOutageCollection(outages));
  }, [outages, mapLoaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource(WORK_ORDER_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(toWorkOrderCollection(workOrders));
  }, [workOrders, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const apply = (layerIds: string[], visible: boolean) => {
      for (const layerId of layerIds) {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };
    apply(operationLayerIds(OUTAGE_SOURCE_ID), showOutages);
    apply(operationLayerIds(WORK_ORDER_SOURCE_ID), showWorkOrders);
    // Isı haritası kesinti katmanından bağımsız açılıp kapanır.
    apply([OUTAGE_HEATMAP_LAYER_ID], showOutageHeatmap);
  }, [showOutages, showWorkOrders, showOutageHeatmap, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    for (const { layerId, visible } of legendVisibility(legend)) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
    for (const { layerId, filter } of buildingFilters(legend)) {
      if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    }
  }, [legend, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    for (const { layerId, filter } of componentFilters(voltageLevels)) {
      if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    }
  }, [voltageLevels, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer(UNITS_PROVINCE_FILL_LAYER_ID)) return;
    const visibility = showAdminBoundaries ? 'visible' : 'none';
    map.setLayoutProperty(UNITS_PROVINCE_FILL_LAYER_ID, 'visibility', visibility);
    map.setLayoutProperty(UNITS_DISTRICT_FILL_LAYER_ID, 'visibility', visibility);
  }, [showAdminBoundaries, mapLoaded]);

  // Seçim `feature-state` ile gösterilir: bina izinin dolgusu koyulaşır, düğüm/kesici
  // vurgulanır. Çizilen geometrinin kendisi boyandığı için ayrı bir seçim geometrisi yok.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

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
  }, [selectedId, mapLoaded]);

  // İz vurgusu — seçimle aynı mekanizma (`feature-state`), ayrı bir katman üretilmez.
  // Önceki iz her seferinde tek tek temizlenir: `removeFeatureState` kaynağın tamamını
  // sıfırlayabilirdi ama o seçimi de silerdi.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

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
  }, [tracedIds, traceDirection, mapLoaded]);

  // Harita odağı: iz açılınca kamera izin kapsayan dikdörtgenine oturur, iz kapanınca
  // kullanıcının seçimden ÖNCEKİ konumuna geri döner. Ayrı bir "temizle" butonuna
  // bağlanmaz — unutulursa harita yanlış konumda takılı kalmış gibi hissedilir.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (traceBbox) {
      savedCameraRef.current ??= { center: map.getCenter().toArray(), zoom: map.getZoom() };
      // `maxZoom` olmadan tek elemanlı bir iz (kofra kesicisi → 0 eleman) sonuna kadar
      // yakınlaşıp bağlamı tamamen kaybettiriyor.
      map.fitBounds(traceBbox, { padding: 64, maxZoom: 17, duration: 600 });
      return;
    }

    const saved = savedCameraRef.current;
    if (saved) {
      map.easeTo({ center: saved.center, zoom: saved.zoom, duration: 600 });
      savedCameraRef.current = null;
    }
    // `traceBbox` dizi kimliği her render'da değişebileceğinden içeriğine göre bağımlanılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceBbox?.join(','), mapLoaded]);

  // İl/ilçe adları — kendi glyph fontumuzu barındırmadığımız için MapLibre `symbol`
  // katmanı yerine HTML işaretçisi kullanılır (dış font sunucusuna bağımlılık yok).
  // İl adı z<8'de, ilçe adları z8–13'te; üstünde hepsi kaybolur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !unitLabels) return;

    for (const marker of labelMarkersRef.current) marker.remove();
    labelMarkersRef.current = [];

    if (!showAdminBoundaries) return;

    const add = (items: typeof unitLabels.provinces, className: string) => {
      for (const unit of items) {
        const el = document.createElement('div');
        el.className = className;
        el.textContent = unit.name;
        const marker = new Marker({ element: el }).setLngLat([unit.centerLon!, unit.centerLat!]).addTo(map);
        labelMarkersRef.current.push(marker);
      }
    };
    add(unitLabels.provinces, styles.provinceLabel!);
    add(unitLabels.districts, styles.districtLabel!);

    const applyZoom = () => {
      const z = map.getZoom();
      for (const marker of labelMarkersRef.current) {
        const el = marker.getElement();
        // `classList` ile bakılır: Marker kendi sınıflarını da eklediğinden `className`
        // birebir karşılaştırması hiçbir zaman tutmaz.
        const isProvince = el.classList.contains(styles.provinceLabel!);
        el.style.display = (isProvince ? z < 8 : z >= 8 && z < 13) ? '' : 'none';
      }
    };
    applyZoom();
    map.on('zoom', applyZoom);
    return () => {
      map.off('zoom', applyZoom);
      for (const marker of labelMarkersRef.current) marker.remove();
      labelMarkersRef.current = [];
    };
  }, [unitLabels, showAdminBoundaries, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: clampToBounds(flyTo.lng, flyTo.lat), zoom: Math.max(flyTo.zoom, 17) });
  }, [flyTo]);

  return <div ref={containerRef} className={styles.container} />;
}

/** Mevcut basemap + şebeke + işletim katmanlarını kaldırıp güncel tema token'larıyla yeniden kurar. */
function rebuildLayers(
  map: MapLibreMap,
  theme: 'light' | 'dark',
  outages: OutageMapItem[] | undefined,
  workOrders: WorkOrderMapItem[] | undefined,
): void {
  const style = map.getStyle();
  if (style) {
    for (const layer of style.layers) {
      if ('source' in layer && (layer.source === NETWORK_SOURCE_ID || layer.source === OUTAGE_SOURCE_ID || layer.source === WORK_ORDER_SOURCE_ID)) {
        map.removeLayer(layer.id);
      }
    }
  }
  if (map.getSource(NETWORK_SOURCE_ID)) map.removeSource(NETWORK_SOURCE_ID);
  if (map.getSource(OUTAGE_SOURCE_ID)) map.removeSource(OUTAGE_SOURCE_ID);
  if (map.getSource(WORK_ORDER_SOURCE_ID)) map.removeSource(WORK_ORDER_SOURCE_ID);
  removeBasemap(map);

  // Katman sırası: altlık harita → il/ilçe renkleri → hatlar → bina izi → düğümler →
  // ısı haritası → kesinti/iş emri noktaları (işletim katmanı her zaman en üstte).
  map.addSource(NETWORK_SOURCE_ID, buildNetworkSource());
  const layers = buildNetworkLayers(theme);
  for (const layer of layers) map.addLayer(layer);
  const firstLayerId = layers[0]!.id;

  map.addSource(OUTAGE_SOURCE_ID, buildOperationSource(toOutageCollection(outages)));
  map.addSource(WORK_ORDER_SOURCE_ID, buildOperationSource(toWorkOrderCollection(workOrders)));
  map.addLayer(buildOutageHeatmapLayer());
  for (const layer of buildOperationLayers(WORK_ORDER_SOURCE_ID, 'workOrder')) map.addLayer(layer);
  for (const layer of buildOperationLayers(OUTAGE_SOURCE_ID, 'outage')) map.addLayer(layer);

  void isBasemapAvailable().then((available) => {
    if (!map.getSource(NETWORK_SOURCE_ID)) return;
    if (available) {
      map.addSource(BASEMAP_SOURCE_ID, { type: 'vector', url: `pmtiles://${window.location.origin}${BASEMAP_PMTILES_URL}` });
      for (const layer of buildBasemapLayers(theme)) map.addLayer(layer, firstLayerId);
    } else {
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
  });
}

function removeBasemap(map: MapLibreMap): void {
  const style = map.getStyle();
  if (!style) return;
  for (const layer of style.layers) {
    if ('source' in layer && layer.source === BASEMAP_SOURCE_ID) map.removeLayer(layer.id);
  }
  if (map.getSource(BASEMAP_SOURCE_ID)) map.removeSource(BASEMAP_SOURCE_ID);
}
