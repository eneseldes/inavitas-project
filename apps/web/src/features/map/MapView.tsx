import { Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '../../features/theme/ThemeProvider.tsx';
import type { VoltageLevel } from '../../types/network.ts';
import { BASEMAP_PMTILES_URL, BASEMAP_SOURCE_ID, buildBasemapLayers, isBasemapAvailable, registerPmtilesProtocol } from './basemap.ts';
import type { MapView as MapViewState } from './useMapState.ts';
import { useComponent } from './useNetwork.ts';
import {
  buildingFilters,
  buildNetworkLayers,
  buildNetworkSource,
  buildSelectedFeatureCollection,
  buildSelectedSource,
  CLICKABLE_LAYER_IDS,
  componentFilters,
  legendVisibility,
  NETWORK_SOURCE_ID,
  SELECTED_SOURCE_ID,
  UNITS_DISTRICT_FILL_LAYER_ID,
  UNITS_PROVINCE_FILL_LAYER_ID,
  type LegendId,
} from './networkLayers.ts';
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
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const { theme } = useTheme();
  // Katman senkron efektleri `loadedRef`'e değil buna bağlıdır — 'load' olayı mount efektinin
  // dışında, React render döngüsü dışında ateşlenir; bir ref güncellemesi tek başına bu
  // efektleri yeniden tetiklemez. URL'den gelen ilk filtre durumu bu state sayesinde uygulanır.
  const [mapLoaded, setMapLoaded] = useState(false);

  // Seçili elemanın konumu — tile LOD'u onu o an elese bile seçim, kullanıcı paneli
  // kapatana kadar bu bağımsız kaynaktan haritada kalır.
  const { data: selectedComponent } = useComponent(selectedId);

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
        onViewChange({ lng: center.lng, lat: center.lat, zoom: map!.getZoom() });
      });

      // Bina izindeki bir kesiciye tıklamak, sahibi olduğu birimi (TM/DM/trafo) seçer —
      // kesici ile birim tek bir eleman gibi davranır (bkz. ankara-yeni-detayli-v3.html).
      const handleFeatureClick = (e: MapLayerMouseEvent) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const id = (props.unit_id as string | undefined) ?? (props.id as string | undefined);
        if (id) onSelect(id);
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

      map.on('load', () => {
        loadedRef.current = true;
        rebuildLayers(map!, theme);
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
    rebuildLayers(map, theme);
  }, [theme]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getSource(SELECTED_SOURCE_ID)) return;
    const shape =
      selectedComponent && selectedComponent.lat !== null && selectedComponent.lon !== null
        ? { lat: selectedComponent.lat, lon: selectedComponent.lon, type: selectedComponent.type }
        : undefined;
    (map.getSource(SELECTED_SOURCE_ID) as GeoJSONSource).setData(buildSelectedFeatureCollection(shape));
  }, [selectedComponent, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: clampToBounds(flyTo.lng, flyTo.lat), zoom: Math.max(flyTo.zoom, 17) });
  }, [flyTo]);

  return <div ref={containerRef} className={styles.container} />;
}

/** Mevcut basemap + şebeke katmanlarını kaldırıp güncel tema token'larıyla yeniden kurar. */
function rebuildLayers(map: MapLibreMap, theme: 'light' | 'dark'): void {
  const style = map.getStyle();
  if (style) {
    for (const layer of style.layers) {
      if ('source' in layer && (layer.source === NETWORK_SOURCE_ID || layer.source === SELECTED_SOURCE_ID)) {
        map.removeLayer(layer.id);
      }
    }
  }
  if (map.getSource(NETWORK_SOURCE_ID)) map.removeSource(NETWORK_SOURCE_ID);
  if (map.getSource(SELECTED_SOURCE_ID)) map.removeSource(SELECTED_SOURCE_ID);
  removeBasemap(map);

  // Katman sırası: altlık harita → il/ilçe renkleri → hatlar → bina izi → düğümler → seçim.
  map.addSource(NETWORK_SOURCE_ID, buildNetworkSource());
  map.addSource(SELECTED_SOURCE_ID, buildSelectedSource());
  const layers = buildNetworkLayers(theme);
  for (const layer of layers) map.addLayer(layer);
  const firstLayerId = layers[0]!.id;

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
