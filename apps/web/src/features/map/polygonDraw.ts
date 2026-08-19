import type { Feature, FeatureCollection, Polygon, Position } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { token } from './networkLayers.ts';

/**
 * Poligon çizim aracı.
 *
 * Hazır bir çizim kütüphanesi eklenmedi: `@mapbox/mapbox-gl-draw` MapLibre ile birebir
 * uyumlu değil, MapLibre uyarlamaları da yalnız tek bir araç için koca bir bağımlılık
 * getiriyor. İhtiyaç duyulan davranış — tıkla-köşe-ekle, çift tıkla-kapat, Esc-iptal —
 * tek bir GeoJSON kaynağı ve üç katmanla ifade edilebiliyor.
 */

const DRAW_SOURCE_ID = 'polygon-draw';

const FILL_LAYER_ID = 'polygon-draw-fill';
const LINE_LAYER_ID = 'polygon-draw-line';
const VERTEX_LAYER_ID = 'polygon-draw-vertex';

const DRAW_LAYER_IDS = [FILL_LAYER_ID, LINE_LAYER_ID, VERTEX_LAYER_ID];

/** Bir poligonun kapanmış sayılması için gereken en az köşe sayısı. */
const MIN_VERTICES = 3;

/** İlk köşeye "yeterince yakın" sayılan piksel yarıçapı — çizimi kapatan tıklama alanı. */
const CLOSE_HIT_RADIUS_PX = 12;

interface PolygonDrawOptions {
  /** Poligon kapandığında çağrılır; geometri GeoJSON `Polygon`'dur (halka kapalı). */
  onComplete: (polygon: Polygon) => void;
  /** Çizim modu her sonlandığında (tamamlanma ya da iptal) çağrılır. */
  onDrawingChange: (isDrawing: boolean) => void;
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

/** Açık bir köşe dizisini kapalı bir GeoJSON halkasına çevirir. */
function toRing(vertices: Position[]): Position[] {
  return [...vertices, vertices[0]!];
}

export class PolygonDrawController {
  private readonly map: MapLibreMap;
  private readonly options: PolygonDrawOptions;

  /** Çizim sürerken biriken köşeler; çizim kapalıyken boştur. */
  private vertices: Position[] = [];
  /** İmlecin son konumu — henüz kapanmamış kenarın lastik bandı buradan çizilir. */
  private cursor: Position | null = null;
  /**
   * Çizilmiş poligon. Sahibi bu sınıf değil çağıran taraftır: kapanan poligon `onComplete`
   * ile dışarı verilir, dışarısı da `setPolygon` ile geri besler. Böylece "haritada görünen"
   * ile "sorguya giden" poligonun ayrı düşmesi mümkün olmaz.
   */
  private polygon: Polygon | null = null;
  private drawing = false;

  constructor(map: MapLibreMap, options: PolygonDrawOptions) {
    this.map = map;
    this.options = options;

    this.map.on('click', this.handleClick);
    this.map.on('mousemove', this.handleMouseMove);
    this.map.on('dblclick', this.handleDoubleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /** Çizim modunda mı — eleman seçimi bu sırada devre dışı bırakılmalıdır. */
  get isDrawing(): boolean {
    return this.drawing;
  }

  /** Çizim modunu açar. Önceki poligonu silmek çağıranın işidir (`setPolygon(null)`). */
  start(): void {
    this.vertices = [];
    this.cursor = null;
    this.drawing = true;
    // Çift tıklama çizimi kapatır; aynı anda yakınlaştırmamalı.
    this.map.doubleClickZoom.disable();
    this.map.getCanvas().style.cursor = 'crosshair';
    this.render();
    this.options.onDrawingChange(true);
  }

  /** Çizimi yarıda bırakır — biriken köşeler atılır, önceki poligon geri gelmez. */
  cancel(): void {
    if (!this.drawing) return;
    this.stopDrawing();
    this.vertices = [];
    this.cursor = null;
    this.render();
  }

  /** Dışarıdan gelen poligonu çizer; `null` haritayı temizler. */
  setPolygon(polygon: Polygon | null): void {
    this.polygon = polygon;
    this.render();
  }

  /**
   * Katmanları (yeniden) kurar. Tema değişiminde stil sıfırdan kurulduğu için dışarıdan
   * çağrılır; token'lar canlı `var()` olarak değil, katman kurulurken çözülür.
   */
  syncLayers(): void {
    this.removeLayers();

    this.map.addSource(DRAW_SOURCE_ID, { type: 'geojson', data: emptyCollection() });
    this.map.addLayer({
      id: FILL_LAYER_ID,
      type: 'fill',
      source: DRAW_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': token('--c-map-draw-fill') },
    });
    this.map.addLayer({
      id: LINE_LAYER_ID,
      type: 'line',
      source: DRAW_SOURCE_ID,
      filter: ['!=', ['geometry-type'], 'Point'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': token('--c-map-draw-line'), 'line-width': 2 },
    });
    this.map.addLayer({
      id: VERTEX_LAYER_ID,
      type: 'circle',
      source: DRAW_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': token('--c-map-draw-vertex'),
        'circle-radius': 4,
        'circle-stroke-width': 2,
        'circle-stroke-color': token('--c-map-draw-line'),
      },
    });

    this.render();
  }

  destroy(): void {
    this.map.off('click', this.handleClick);
    this.map.off('mousemove', this.handleMouseMove);
    this.map.off('dblclick', this.handleDoubleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.map.getCanvas().style.cursor = '';
  }

  private stopDrawing(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.map.doubleClickZoom.enable();
    this.map.getCanvas().style.cursor = '';
    this.options.onDrawingChange(false);
  }

  private readonly handleClick = (e: MapMouseEvent): void => {
    if (!this.drawing) return;

    // İlk köşeye basmak poligonu kapatır — çift tıklamayı bilmeyen kullanıcının da bir yolu olsun.
    const first = this.vertices[0];
    if (first && this.vertices.length >= MIN_VERTICES) {
      const firstPoint = this.map.project(first as [number, number]);
      const distance = Math.hypot(firstPoint.x - e.point.x, firstPoint.y - e.point.y);
      if (distance <= CLOSE_HIT_RADIUS_PX) {
        this.complete();
        return;
      }
    }

    this.vertices.push([e.lngLat.lng, e.lngLat.lat]);
    this.render();
  };

  private readonly handleMouseMove = (e: MapMouseEvent): void => {
    if (!this.drawing || this.vertices.length === 0) return;
    this.cursor = [e.lngLat.lng, e.lngLat.lat];
    this.render();
  };

  private readonly handleDoubleClick = (): void => {
    if (!this.drawing) return;
    this.complete();
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.drawing) return;
    if (e.key === 'Escape') this.cancel();
    // Enter, çift tıklamanın klavye karşılığıdır.
    if (e.key === 'Enter') this.complete();
  };

  private complete(): void {
    // Çift tıklama son köşeyi iki kez ekler; kapatmadan önce tekrar eden köşe atılır.
    const deduped = this.vertices.filter((vertex, index) => {
      const previous = this.vertices[index - 1];
      return !previous || previous[0] !== vertex[0] || previous[1] !== vertex[1];
    });
    if (deduped.length < MIN_VERTICES) return;

    const polygon: Polygon = { type: 'Polygon', coordinates: [toRing(deduped)] };
    this.vertices = [];
    this.cursor = null;
    this.stopDrawing();
    this.render();
    this.options.onComplete(polygon);
  }

  /** Kaynağın verisini o anki duruma göre yeniden üretir — köşeler, lastik bant ve poligon. */
  private render(): void {
    const source = this.map.getSource(DRAW_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    const features: Feature[] = [];

    if (this.polygon) {
      features.push({ type: 'Feature', geometry: this.polygon, properties: {} });
    }

    if (this.vertices.length > 0) {
      // Kapanmamış çizim: köşelerden geçen kırık çizgi + imlece uzanan lastik bant.
      const path = this.cursor ? [...this.vertices, this.cursor] : this.vertices;
      if (path.length >= 2) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: {} });
      }
      for (const vertex of this.vertices) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: vertex }, properties: {} });
      }
    }

    source.setData({ type: 'FeatureCollection', features });
  }

  private removeLayers(): void {
    for (const layerId of DRAW_LAYER_IDS) {
      if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
    }
    if (this.map.getSource(DRAW_SOURCE_ID)) this.map.removeSource(DRAW_SOURCE_ID);
  }
}

/**
 * Bir noktanın poligonun içinde olup olmadığını ışın atma (ray casting) ile söyler.
 *
 * Kesinti ve iş emri katmanları harita için zaten istemcide duruyor (sunucudaki üst sınıra
 * kadar, mevcut filtreleriyle) — bunları poligon için sunucuya ikinci kez sormak aynı
 * veriyi iki kez taşımak olurdu. Şebeke elemanları içinse 593 bin satır asla istemciye
 * inmediğinden sorgu sunucuda (`ST_Intersects`) çalışır.
 */
export function isPointInPolygon(lon: number, lat: number, polygon: Polygon): boolean {
  let inside = false;
  for (const ring of polygon.coordinates) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}
