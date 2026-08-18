import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  LineLayerSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { NETWORK_TILE_URL_TEMPLATE } from './api.ts';
import type { VoltageLevel } from '../../types/network.ts';

export const NETWORK_SOURCE_ID = 'network';
export const SELECTED_SOURCE_ID = 'selected-component';

export const UNITS_PROVINCE_FILL_LAYER_ID = 'units-province-fill';
export const UNITS_DISTRICT_FILL_LAYER_ID = 'units-district-fill';

/** Bina izinin açıldığı zoom — tiles/zoom-lod.ts'teki `BUILDING_ZOOM` ile aynı olmalı. */
export const BUILDING_ZOOM = 16;

const LINESTRING_GEOMETRY_FILTER: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const POINT_GEOMETRY_FILTER: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

export function buildNetworkSource(): VectorSourceSpecification {
  return {
    // `URL`/`URLSearchParams` yüzde-kodlar `{z}/{x}/{y}` süslü ayraçlarını — MapLibre'nin
    // yer tutucu değişimini kırar. Düz string birleştirme kullanılır.
    type: 'vector',
    tiles: [`${window.location.origin}${NETWORK_TILE_URL_TEMPLATE}`],
    minzoom: 0,
    maxzoom: 20,
    promoteId: { components: 'id' },
  };
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// --- Efsane (sağ panel) ------------------------------------------------------
//
// ankara-yeni-detayli-v3.html'deki katman listesinin birebir karşılığı. İki bölüm:
// HATLAR ve BİRİMLER. Hat katmanları birim katmanlarından **bağımsızdır** — TM'i
// kapatmak TM'e giden HV hattını gizlemez, çünkü hat ayrı bir katmandır.

export const LINE_LEGEND_IDS = ['HV_LINE', 'MV_MAIN', 'MV_BRANCH', 'LV_LINE'] as const;
export type LineLegendId = (typeof LINE_LEGEND_IDS)[number];

export const UNIT_LEGEND_IDS = ['TM', 'DM', 'TRANSFORMER', 'LV_JUNCTION', 'SERVICE_ENTRY', 'CUSTOMER'] as const;
export type UnitLegendId = (typeof UNIT_LEGEND_IDS)[number];

export type LegendId = LineLegendId | UnitLegendId;
export const LEGEND_IDS: readonly LegendId[] = [...LINE_LEGEND_IDS, ...UNIT_LEGEND_IDS];

/** Efsane satırının rengi (sağ paneldeki nokta/çizgi örneği). */
export const LEGEND_COLOR_VAR: Record<LegendId, string> = {
  HV_LINE: 'var(--c-map-line-hv)',
  MV_MAIN: 'var(--c-map-line-mv)',
  MV_BRANCH: 'var(--c-map-line-mv-branch)',
  LV_LINE: 'var(--c-map-line-lv)',
  TM: 'var(--c-map-tm)',
  DM: 'var(--c-map-dm)',
  TRANSFORMER: 'var(--c-map-tr)',
  LV_JUNCTION: 'var(--c-map-lvj)',
  SERVICE_ENTRY: 'var(--c-map-breaker)',
  CUSTOMER: 'var(--c-map-customer)',
};

/** Bina izi olan birimler — tile'daki `unit_type` değerleriyle aynı. */
const BUILDING_UNIT_LEGEND_IDS = ['TM', 'DM', 'TRANSFORMER'] as const;

// Katman kimlikleri — çizim sırası (alttan üste) v3'teki pane z-index'lerini izler:
// LV(405) → kofra(405) → MV kolu(408) → MV ana(411) → HV(414) → bina(425) →
// bina içi(435) → düğüm(445) → seçim(655).
const L = {
  lvLine: 'line-lv',
  dropLine: 'line-drop',
  mvBranch: 'line-mv-branch',
  mvMainCase: 'line-mv-main-case',
  mvMain: 'line-mv-main',
  mvTie: 'line-mv-tie',
  hvCase: 'line-hv-case',
  hv: 'line-hv',
  bldHalo: 'bld-halo',
  bldWash: 'bld-wash',
  bldTint: 'bld-tint',
  bldOutline: 'bld-outline',
  bldInner: 'bld-inner',
  lvj: 'unit-lvj',
  kofra: 'unit-kofra',
  transformer: 'unit-transformer',
  dm: 'unit-dm',
  tm: 'unit-tm',
  bldBreaker: 'bld-breaker',
  customers: 'customers-point',
  selectedHalo: 'selected-halo',
  selectedWall: 'selected-wall',
} as const;

/** Bir efsane satırı açılıp kapandığında görünürlüğü değişen MapLibre katmanları. */
export const LEGEND_LAYER_IDS: Record<LegendId, string[]> = {
  HV_LINE: [L.hvCase, L.hv],
  MV_MAIN: [L.mvMainCase, L.mvMain, L.mvTie],
  MV_BRANCH: [L.mvBranch],
  LV_LINE: [L.lvLine],
  TM: [L.tm],
  DM: [L.dm],
  TRANSFORMER: [L.transformer],
  LV_JUNCTION: [L.lvj],
  // v3'te "Kofra kesicisi / ev girişi" tek satır: irtibat hattı + kofra kesicisi birlikte.
  SERVICE_ENTRY: [L.dropLine, L.kofra],
  CUSTOMER: [L.customers],
};

/** Tıklanabilir katmanlar — hat katmanları dahil değil (v3'te de yalnız düğümler tıklanır). */
export const CLICKABLE_LAYER_IDS = [L.tm, L.dm, L.transformer, L.lvj, L.kofra, L.bldBreaker, L.customers];

/** Bina izi katmanları — görünürlüğü zoom'a değil, ait olduğu birimin efsane satırına bağlıdır. */
export const BUILDING_LAYER_IDS = [L.bldHalo, L.bldWash, L.bldTint, L.bldOutline, L.bldInner, L.bldBreaker];

// --- Hat katmanları ----------------------------------------------------------

function lineLayer(
  id: string,
  types: string[],
  color: string,
  width: number,
  opacity: number,
  dash?: [number, number],
): LineLayerSpecification {
  return {
    id,
    type: 'line',
    source: NETWORK_SOURCE_ID,
    'source-layer': 'components',
    filter: rememberBaseFilter(id, ['all', LINESTRING_GEOMETRY_FILTER, ['in', ['get', 'type'], ['literal', types]]]),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': width,
      'line-opacity': opacity,
      ...(dash ? { 'line-dasharray': dash } : {}),
    },
  };
}

// --- Birim / düğüm katmanları ------------------------------------------------
//
// ⚠️ BUS, FEEDER ve LV_BUS hiç çizilmez; kaynak veride birimle **tam aynı koordinatta**
// durdukları için üstünü kapatıp birimin kendisini tıklanamaz hale getiriyorlardı
// (v3'teki "BUS'un pini yok" notunun sebebi). Aynı şekilde TM/DM/trafo kesicileri de
// burada değil, yalnız bina izi içinde (ring'e yayılmış konumlarında) çizilir.

function pointLayer(id: string, filter: ExpressionSpecification, radius: ExpressionSpecification, color: string, stroke: string): CircleLayerSpecification {
  return {
    id,
    type: 'circle',
    source: NETWORK_SOURCE_ID,
    'source-layer': 'components',
    filter: rememberBaseFilter(id, ['all', POINT_GEOMETRY_FILTER, filter]),
    paint: {
      'circle-color': color,
      'circle-radius': radius,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': stroke,
      'circle-opacity': 0.95,
    },
  };
}

function radius(near: number, mid: number, far: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 8, near, 14, mid, 20, far];
}

/** `unit_type` → değer eşlemesi; renk (string) ve kalınlık (number) için ortak. */
function unitTypeMatch<T extends string | number>(tm: T, dm: T, tr: T): ExpressionSpecification {
  return ['match', ['get', 'unit_type'], 'TM', tm, 'DM', dm, tr] as ExpressionSpecification;
}

/** Katmanları v3'teki çizim sırasıyla (alttan üste) döndürür. */
export function buildNetworkLayers(theme: 'light' | 'dark'): LayerSpecification[] {
  // Pastel bantlar iki temada da açık renktir; koyu zeminde yalnız opaklık düşürülür —
  // koyulaştırılsalar altlıkla birleşip siyah bir lekeye dönüşüyorlardı.
  const bandOpacity = theme === 'dark' ? 0.24 : 0.38;

  return [
    // 1. İl/ilçe dolgusu — her şeyin altında, sınır çizgisi yok.
    {
      id: UNITS_PROVINCE_FILL_LAYER_ID,
      type: 'fill',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'units',
      filter: ['==', ['get', 'level'], 'PROVINCE'],
      maxzoom: 8,
      paint: { 'fill-color': bandColor(), 'fill-opacity': bandOpacity },
    },
    {
      id: UNITS_DISTRICT_FILL_LAYER_ID,
      type: 'fill',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'units',
      filter: ['==', ['get', 'level'], 'DISTRICT'],
      minzoom: 8,
      maxzoom: 13,
      paint: { 'fill-color': bandColor(), 'fill-opacity': bandOpacity },
    },

    // 2. Hatlar — ince olandan kalın olana.
    lineLayer(L.lvLine, ['LV_LINE'], token('--c-map-line-lv'), 1, 0.75),
    lineLayer(L.dropLine, ['SERVICE_DROP'], token('--c-map-line-drop'), 0.8, 0.55),
    lineLayer(L.mvBranch, ['MV_BRANCH'], token('--c-map-line-mv-branch'), 1.6, 0.92),
    lineLayer(L.mvMainCase, ['MV_LINE'], token('--c-map-line-case'), 4.4, 0.6),
    lineLayer(L.mvMain, ['MV_LINE'], token('--c-map-line-mv'), 2.6, 0.95),
    lineLayer(L.mvTie, ['MV_TIE_LINE'], token('--c-map-line-tie'), 2, 0.95, [9, 6]),
    lineLayer(L.hvCase, ['HV_LINE', 'HV_LINK'], token('--c-map-line-case'), 5.4, 0.55),
    lineLayer(L.hv, ['HV_LINE', 'HV_LINK'], token('--c-map-line-hv'), 3.2, 0.95),

    // 3. Bina izi — "buzlu cam": dış halo, beyaz yıkama, birim tonu, koyu duvar.
    //    Altından GEÇEN hat soluklaşır; birime BAĞLI olan hat üstteki katmanda net kalır.
    {
      id: L.bldHalo,
      type: 'fill',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'building_shapes',
      filter: ['==', ['get', 'ring'], 'halo'],
      minzoom: BUILDING_ZOOM,
      paint: {
        'fill-color': unitTypeMatch(token('--c-map-tm-tint'), token('--c-map-dm-tint'), token('--c-map-tr-tint')),
        'fill-opacity': 0.24,
      },
    },
    {
      id: L.bldWash,
      type: 'fill',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'building_shapes',
      filter: ['==', ['get', 'ring'], 'wall'],
      minzoom: BUILDING_ZOOM,
      paint: { 'fill-color': token('--c-map-bld-wash'), 'fill-opacity': 0.55 },
    },
    {
      id: L.bldTint,
      type: 'fill',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'building_shapes',
      filter: ['==', ['get', 'ring'], 'wall'],
      minzoom: BUILDING_ZOOM,
      paint: {
        'fill-color': unitTypeMatch(token('--c-map-tm-tint'), token('--c-map-dm-tint'), token('--c-map-tr-tint')),
        'fill-opacity': 0.42,
      },
    },
    {
      id: L.bldOutline,
      type: 'line',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'building_shapes',
      filter: ['==', ['get', 'ring'], 'wall'],
      minzoom: BUILDING_ZOOM,
      paint: {
        'line-color': unitTypeMatch(token('--c-map-tm-dark'), token('--c-map-dm-dark'), token('--c-map-tr-dark')),
        'line-width': 1,
        'line-opacity': 0.5,
      },
    },
    // 4. Bina içi yol: duvardaki kesiciden birimin kendisine — TM'de her fider için bir tane.
    {
      id: L.bldInner,
      type: 'line',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'building_inner',
      minzoom: BUILDING_ZOOM,
      paint: {
        'line-color': unitTypeMatch(token('--c-map-tm-dark'), token('--c-map-dm-dark'), token('--c-map-tr-dark')),
        'line-width': unitTypeMatch(1.8, 1.6, 1.4),
        'line-opacity': 0.95,
      },
    },

    // 5. Düğümler — küçükten büyüğe, TM en üstte kalsın diye.
    pointLayer(L.lvj, ['==', ['get', 'type'], 'LV_JUNCTION'], radius(2, 2.6, 4.5), token('--c-map-lvj'), token('--c-map-lvj-dark')),
    pointLayer(L.kofra, ['==', ['get', 'breaker_role'], 'SERVICE_ENTRY'], radius(2, 2.8, 5), token('--c-map-breaker'), token('--c-map-breaker-dark')),
    pointLayer(L.transformer, ['==', ['get', 'type'], 'TRANSFORMER'], radius(2.6, 3.6, 6.5), token('--c-map-tr'), token('--c-map-tr-dark')),
    pointLayer(L.dm, ['==', ['get', 'type'], 'DM'], radius(3.2, 4.4, 8), token('--c-map-dm'), token('--c-map-dm-dark')),
    pointLayer(L.tm, ['==', ['get', 'type'], 'TM'], radius(5, 7, 12), token('--c-map-tm'), token('--c-map-tm-dark')),

    // 6. Birim kesicileri — yalnız bina izi açıkken, duvara yayılmış konumlarında.
    {
      id: L.bldBreaker,
      type: 'circle',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'building_breakers',
      minzoom: BUILDING_ZOOM,
      paint: {
        'circle-color': token('--c-map-breaker'),
        'circle-radius': unitTypeMatch(2.8, 2.5, 2.2),
        'circle-stroke-width': 1.2,
        'circle-stroke-color': token('--c-map-breaker-dark'),
      },
    },

    {
      id: L.customers,
      type: 'circle',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'customers',
      paint: { 'circle-color': token('--c-map-customer'), 'circle-radius': 2.5 },
    },

    // 7. Seçim vurgusu — en üstte, kendi GeoJSON kaynağından (tile LOD'undan bağımsız).
    {
      id: L.selectedWall,
      type: 'line',
      source: SELECTED_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': token('--c-map-selected'), 'line-width': 2.4 },
    },
    {
      id: L.selectedHalo,
      type: 'circle',
      source: SELECTED_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 7, 14, 11, 20, 18],
        'circle-color': 'transparent',
        'circle-stroke-width': 2.6,
        'circle-stroke-color': token('--c-map-selected'),
      },
    },
  ];
}

// --- Filtreler ---------------------------------------------------------------

/**
 * Efsane seçimi **katman görünürlüğüyle** uygulanır (bkz. LEGEND_LAYER_IDS) — filtreyle
 * değil. Hat katmanları birim katmanlarından ayrı olduğu için TM'i kapatmak yalnız TM
 * düğümünü ve bina izini gizler, TM'e giden HV hattına dokunmaz.
 */
export function legendVisibility(active: Set<LegendId>): { layerId: string; visible: boolean }[] {
  return LEGEND_IDS.flatMap((legendId) =>
    LEGEND_LAYER_IDS[legendId].map((layerId) => ({ layerId, visible: active.has(legendId) })),
  );
}

/** Bina izi katmanlarının filtresi — yalnız efsanede açık olan birim tipleri çizilir. */
export function buildingFilters(active: Set<LegendId>): { layerId: string; filter: ExpressionSpecification }[] {
  const types = BUILDING_UNIT_LEGEND_IDS.filter((id) => active.has(id));
  const inTypes: ExpressionSpecification = ['in', ['get', 'unit_type'], ['literal', types]];
  const ringOf: Record<string, 'halo' | 'wall' | undefined> = {
    [L.bldHalo]: 'halo',
    [L.bldWash]: 'wall',
    [L.bldTint]: 'wall',
    [L.bldOutline]: 'wall',
  };
  return BUILDING_LAYER_IDS.map((layerId) => {
    const ring = ringOf[layerId];
    return { layerId, filter: ring ? (['all', inTypes, ['==', ['get', 'ring'], ring]] as ExpressionSpecification) : inTypes };
  });
}

/**
 * Gerilim filtresi katmanın kendi tip filtresine eklenir; taban filtreler burada tutulur
 * ki her değişiklikte katmanı yeniden kurmak gerekmesin.
 */
const COMPONENT_LAYER_BASE_FILTERS: Record<string, ExpressionSpecification> = {};

function rememberBaseFilter(id: string, filter: ExpressionSpecification): ExpressionSpecification {
  COMPONENT_LAYER_BASE_FILTERS[id] = filter;
  return filter;
}

/** `components` kaynağını kullanan katmanların gerilim filtresiyle birleştirilmiş filtreleri. */
export function componentFilters(voltageLevels: Set<VoltageLevel>): { layerId: string; filter: ExpressionSpecification }[] {
  const voltage: ExpressionSpecification = ['in', ['get', 'voltage_level'], ['literal', Array.from(voltageLevels)]];
  return Object.entries(COMPONENT_LAYER_BASE_FILTERS).map(([layerId, base]) => ({
    layerId,
    filter: ['all', base, voltage] as ExpressionSpecification,
  }));
}

// --- İl/ilçe renk bandı ------------------------------------------------------

/**
 * Birimin renk bandı (0-7) — `units.path` "TR.06.021" gibi bir ltree metni olduğundan
 * istemcide sayıya çevrilemez; hash sunucuda (`hashtext`) hesaplanıp `band` kolonunda gelir.
 */
function bandColor(): ExpressionSpecification {
  return [
    'match',
    ['get', 'band'],
    0, token('--c-map-unit-band-0'),
    1, token('--c-map-unit-band-1'),
    2, token('--c-map-unit-band-2'),
    3, token('--c-map-unit-band-3'),
    4, token('--c-map-unit-band-4'),
    5, token('--c-map-unit-band-5'),
    6, token('--c-map-unit-band-6'),
    token('--c-map-unit-band-7'),
  ];
}

// --- Seçili eleman -----------------------------------------------------------

export interface SelectedComponentShape {
  lat: number;
  lon: number;
  type: string;
}

export function buildSelectedSource(): GeoJSONSourceSpecification {
  return { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
}

/** Bina izi yarıçapları — tiles/service.ts'teki `building_units.radius` ile aynı. */
const SELECTED_RADIUS_M: Record<string, number> = { TM: 9, DM: 5.5, TRANSFORMER: 4.5 };

function octagonRing(lon: number, lat: number, radiusMeters: number): [number, number][] {
  // Duvar yarıçapta olsun diye köşeler 1/cos(pi/8) ile açılır — tile'daki buffer ile aynı.
  const rr = radiusMeters / Math.cos(Math.PI / 8);
  const dLat = rr / 111_320;
  const dLon = rr / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (2 * Math.PI * i) / 8 + Math.PI / 8;
    ring.push([lon + dLon * Math.sin(a), lat + dLat * Math.cos(a)]);
  }
  return ring;
}

/**
 * Seçili elemanın vurgusu: her zoom'da bir halka, bina izi olan birimlerde ayrıca duvarın
 * üstüne oturan bir sekizgen. Tile o elemanı LOD yüzünden elese bile seçim, kullanıcı
 * kapatana kadar haritada kalır.
 */
export function buildSelectedFeatureCollection(shape: SelectedComponentShape | undefined): FeatureCollection {
  if (!shape) return { type: 'FeatureCollection', features: [] };
  const features: FeatureCollection['features'] = [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [shape.lon, shape.lat] }, properties: {} },
  ];
  const r = SELECTED_RADIUS_M[shape.type];
  if (r !== undefined) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [octagonRing(shape.lon, shape.lat, r)] },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}
