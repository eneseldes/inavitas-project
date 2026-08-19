import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  LayerSpecification,
  LineLayerSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import { NETWORK_TILE_URL_TEMPLATE } from './api.ts';
import type { VoltageLevel } from '../../types/network.ts';

export const NETWORK_SOURCE_ID = 'network';

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
    // Seçim `feature-state` ile gösterildiğinden her katmanın özellik kimliği tanıtılmalı.
    promoteId: { components: 'id', building_shapes: 'id', building_breakers: 'id' },
  };
}

/**
 * CSS custom property'yi düz renk değerine çözer. MapLibre canlı `var()` desteklemediği
 * için token'lar yalnız katman kurulurken çözülür; tema değişince katmanlar yeniden kurulur.
 */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// --- Efsane (sağ panel) ------------------------------------------------------
//
// Düz katman listesi, iki bölüm: HATLAR ve BİRİMLER. İki seviyeli bir kategori ağacı
// denendi ve terk edildi, çünkü hat katmanları birim katmanlarından **bağımsızdır** —
// TM'i kapatmak TM'e giden HV hattını gizlemez, hat ayrı bir katmandır ve kategori bazlı
// tek filtre bunu ifade edemiyordu.

export const LINE_LEGEND_IDS = ['HV_LINE', 'MV_MAIN', 'MV_BRANCH', 'LV_LINE'] as const;
export type LineLegendId = (typeof LINE_LEGEND_IDS)[number];

export const UNIT_LEGEND_IDS = ['TM', 'DM', 'TRANSFORMER', 'LV_JUNCTION', 'SERVICE_ENTRY'] as const;
export type UnitLegendId = (typeof UNIT_LEGEND_IDS)[number];

/**
 * Her katmanın görünmeye başladığı kesin zoom. Sunucu tile'ı tam sayı zoom'da ürettiği için
 * kaba eleme orada (zoom-lod.ts `TYPE_MIN_ZOOM`, tabana yuvarlanmış) yapılır; kesin eşik
 * burada `minzoom` ile uygulanır. İki tablo birlikte değişmelidir.
 */
export const LEGEND_MIN_ZOOM: Record<LegendId, number> = {
  HV_LINE: 8,
  TM: 8,
  MV_MAIN: 9.75,
  DM: 9.75,
  MV_BRANCH: 12,
  TRANSFORMER: 12,
  LV_LINE: 15,
  LV_JUNCTION: 15,
  SERVICE_ENTRY: 16.5,
};

export type LegendId = LineLegendId | UnitLegendId;
export const LEGEND_IDS: readonly LegendId[] = [...LINE_LEGEND_IDS, ...UNIT_LEGEND_IDS];

// Efsane satırlarının renk örnekleri katmanla aynı token'lardan gelir ama SCSS tarafında
// (bkz. MapPanel.module.scss `.swatch*`) tanımlıdır — bileşenler renk değeri taşımaz.

/** Bina izi olan birimler — tile'daki `unit_type` değerleriyle aynı. */
const BUILDING_UNIT_LEGEND_IDS = ['TM', 'DM', 'TRANSFORMER', 'SERVICE_ENTRY'] as const;

// Katman kimlikleri. Dizi sırası aynı zamanda çizim sırasıdır (alttan üste): ince/az
// önemli olan altta, kalın/öncelikli olan üstte kalsın diye —
// LV → kofra → MV kolu → MV ana → HV → bina izi → bina içi yol → düğümler → kesiciler.
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
  // "Kofra kesicisi / ev girişi" efsanede tek satırdır: irtibat hattı + kofra kesicisi
  // birlikte açılıp kapanır — kullanıcı için ikisi tek bir görsel bütündür.
  SERVICE_ENTRY: [L.dropLine, L.kofra],
};

/**
 * Tıklanabilir katmanlar — yalnız düğümler ve bina izi; **hat katmanları dahil değil**.
 * Seçim bir noktayı işaret eder, bir güzergâhı değil.
 * Bina izinin duvar dolgusu tıklanabilir: birimi seçmek için binanın herhangi bir yerine
 * basmak yeter, minik düğüm noktasını yakalamak gerekmez.
 */
export const CLICKABLE_LAYER_IDS = [L.tm, L.dm, L.transformer, L.lvj, L.kofra, L.bldBreaker, L.bldTint];

/** Bina izi katmanları — görünürlüğü zoom'a değil, ait olduğu birimin efsane satırına bağlıdır. */
export const BUILDING_LAYER_IDS = [L.bldHalo, L.bldWash, L.bldTint, L.bldOutline, L.bldInner, L.bldBreaker];

// --- İz vurgusu (upstream / downstream) --------------------------------------
//
// İz ayrı bir katman ÜRETMEZ; zaten çizilen geometrinin `feature-state`'i boyanır.
// Durum boolean değil string taşır ('up' | 'down'), çünkü iki yön iki ayrı renktir ve
// tek bir bayrak bunu ifade edemez. Ayarlanmamış `feature-state` null döner; `==` farklı
// tipleri sessizce `false` sayar, bu yüzden ek bir varlık kontrolü gerekmez.

const TRACED_UP: ExpressionSpecification = ['==', ['feature-state', 'traced'], 'up'];
const TRACED_DOWN: ExpressionSpecification = ['==', ['feature-state', 'traced'], 'down'];
const IS_TRACED: ExpressionSpecification = ['any', TRACED_UP, TRACED_DOWN];

/** İz rengi; iz yoksa katmanın kendi rengine düşer. */
function tracedColor(base: string): ExpressionSpecification {
  return ['case', TRACED_UP, token('--c-map-trace-up'), TRACED_DOWN, token('--c-map-trace-down'), base];
}

/** İzdeki eleman öne çıksın diye kalınlık/opaklık gibi sayısal değerleri yükseltir. */
function tracedValue(base: number, traced: number): ExpressionSpecification {
  return ['case', IS_TRACED, traced, base];
}

// --- Hat katmanları ----------------------------------------------------------

function lineLayer(
  id: string,
  types: string[],
  color: string,
  width: number,
  opacity: number,
  minzoom: number,
  dash?: [number, number],
): LineLayerSpecification {
  return {
    id,
    type: 'line',
    source: NETWORK_SOURCE_ID,
    'source-layer': 'components',
    minzoom,
    filter: rememberBaseFilter(id, ['all', LINESTRING_GEOMETRY_FILTER, ['in', ['get', 'type'], ['literal', types]]]),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      // İzdeki hat kendi renginin yerine iz rengiyle, bir tık kalın ve tam opak çizilir —
      // 0,4 kV hattı gibi soluk katmanlarda iz aksi halde fark edilmiyordu.
      'line-color': tracedColor(color),
      'line-width': tracedValue(width, width * 2),
      'line-opacity': tracedValue(opacity, 1),
      ...(dash ? { 'line-dasharray': dash } : {}),
    },
  };
}

// --- Birim / düğüm katmanları ------------------------------------------------
//
// ⚠️ BUS, FEEDER ve LV_BUS hiç çizilmez; kaynak veride sahibi oldukları birimle **tam aynı
// koordinatta** durdukları için üstünü kapatıp birimin kendisini tıklanamaz hale
// getiriyorlardı. Aynı şekilde TM/DM/trafo kesicileri de burada değil, yalnız bina izi
// içinde (duvara yayılmış konumlarında) çizilir.

function pointLayer(
  id: string,
  filter: ExpressionSpecification,
  radius: ExpressionSpecification,
  color: string,
  stroke: string,
  minzoom: number,
): CircleLayerSpecification {
  return {
    id,
    type: 'circle',
    source: NETWORK_SOURCE_ID,
    'source-layer': 'components',
    minzoom,
    filter: rememberBaseFilter(id, ['all', POINT_GEOMETRY_FILTER, filter]),
    paint: {
      // İzdeki düğüm gövdesinden boyanır; seçim ise yalnız kenarı değiştirir. Böylece
      // seçili eleman aynı anda izin de parçasıysa ikisi birbirini ezmez.
      'circle-color': tracedColor(color),
      'circle-radius': radius,
      // Seçili birim kendi düğümünde de belli olur — bina izinin görünmediği zoom'larda
      // (z<16) tek işaret budur. Ayrı bir halka katmanı YOK: kullanıcı "seçince etrafında
      // yuvarlak oluşmasın, sadece geometrisi seçili görünsün" dedi.
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], token('--c-map-selected'), stroke],
      'circle-opacity': 0.95,
    },
  };
}

function radius(near: number, mid: number, far: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 8, near, 14, mid, 20, far];
}

/** `unit_type` → değer eşlemesi; renk (string) ve kalınlık (number) için ortak. */
function unitTypeMatch<T extends string | number>(tm: T, dm: T, tr: T, kofra: T): ExpressionSpecification {
  return ['match', ['get', 'unit_type'], 'TM', tm, 'DM', dm, 'SERVICE_ENTRY', kofra, tr] as ExpressionSpecification;
}

/**
 * Bina izi, birimin KENDİ düğüm rengiyle doldurulur (ayrı bir "tint" tonuyla değil) — poligon
 * hangi elemana ait olduğunu renginden belli eder. Doygunluğu `fill-opacity` ayarlar.
 */
const TINT = () => unitTypeMatch(token('--c-map-tm'), token('--c-map-dm'), token('--c-map-tr'), token('--c-map-breaker'));
const EDGE = () => unitTypeMatch(token('--c-map-tm-dark'), token('--c-map-dm-dark'), token('--c-map-tr-dark'), token('--c-map-breaker-dark'));

/** Katmanları çizim sırasıyla (alttan üste) döndürür. */
export function buildNetworkLayers(theme: 'light' | 'dark'): LayerSpecification[] {
  return [
    // 1. İl/ilçe dolgusu — her şeyin altında, sınır çizgisi yok.
    //
    // Yalnız BURADA yumuşak geçiş var: kesinti/iş emri rozetlerindeki solma "dandik"
    // bulunup kaldırıldığından (bkz. operationLayers.ts) bu iki dolgu katmanı artık kendi
    // başına, açıkça istenen tek solma efekti. Sert `minzoom`/`maxzoom` kesmeleri yerine
    // `unitFillOpacity` içindeki bindirilmiş bantlarda (z7,5-8,5 il↔ilçe, z13-14 ilçenin
    // kendi solması) gerçek bir geçiş olur.
    {
      id: UNITS_PROVINCE_FILL_LAYER_ID,
      type: 'fill',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'units',
      filter: ['==', ['get', 'level'], 'PROVINCE'],
      maxzoom: UNIT_FADE_ZOOM_MID,
      paint: {
        'fill-color': bandColor(),
        'fill-opacity': unitFillOpacity(theme, 'province'),
        'fill-color-transition': { duration: 400 },
        'fill-opacity-transition': { duration: 400 },
      },
    },
    {
      id: UNITS_DISTRICT_FILL_LAYER_ID,
      type: 'fill',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'units',
      filter: ['==', ['get', 'level'], 'DISTRICT'],
      minzoom: UNIT_FADE_ZOOM_MIN,
      maxzoom: DISTRICT_FADE_OUT_END,
      paint: {
        'fill-color': bandColor(),
        'fill-opacity': unitFillOpacity(theme, 'district'),
        'fill-color-transition': { duration: 400 },
        'fill-opacity-transition': { duration: 400 },
      },
    },

    // 2. Hatlar — ince olandan kalın olana; her biri kendi zoom eşiğinden sonra çizilir.
    lineLayer(L.lvLine, ['LV_LINE'], token('--c-map-line-lv'), 1, 0.75, LEGEND_MIN_ZOOM.LV_LINE),
    lineLayer(L.dropLine, ['SERVICE_DROP'], token('--c-map-line-drop'), 0.8, 0.55, LEGEND_MIN_ZOOM.SERVICE_ENTRY),
    lineLayer(L.mvBranch, ['MV_BRANCH'], token('--c-map-line-mv-branch'), 1.6, 0.92, LEGEND_MIN_ZOOM.MV_BRANCH),
    lineLayer(L.mvMainCase, ['MV_LINE'], token('--c-map-line-case'), 4.4, 0.6, LEGEND_MIN_ZOOM.MV_MAIN),
    lineLayer(L.mvMain, ['MV_LINE'], token('--c-map-line-mv'), 2.6, 0.95, LEGEND_MIN_ZOOM.MV_MAIN),
    lineLayer(L.mvTie, ['MV_TIE_LINE'], token('--c-map-line-tie'), 2, 0.95, LEGEND_MIN_ZOOM.MV_MAIN, [9, 6]),
    lineLayer(L.hvCase, ['HV_LINE', 'HV_LINK'], token('--c-map-line-case'), 5.4, 0.55, LEGEND_MIN_ZOOM.HV_LINE),
    lineLayer(L.hv, ['HV_LINE', 'HV_LINK'], token('--c-map-line-hv'), 3.2, 0.95, LEGEND_MIN_ZOOM.HV_LINE),

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
        // Ana renk "tint" tonlarından doygun olduğu için opaklık düşük tutulur.
        'fill-color': TINT(),
        'fill-opacity': 0.14,
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
        // Bina izi de ize girer: bir fideri izlerken altındaki trafo binaları da boyanır.
        'fill-color': ['case', TRACED_UP, token('--c-map-trace-up'), TRACED_DOWN, token('--c-map-trace-down'), TINT()],
        // Seçim, kenar rengini değiştirerek değil yapının dolgusunu koyulaştırarak
        // gösterilir — bina "yanmış" gibi okunur, ince bir çerçeve gibi değil.
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.8, IS_TRACED, 0.6, 0.26],
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
        'line-color': EDGE(),
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
        'line-color': EDGE(),
        'line-width': unitTypeMatch(1.8, 1.6, 1.4, 1.2),
        'line-opacity': 0.95,
      },
    },

    // 5. Düğümler — küçükten büyüğe, TM en üstte kalsın diye.
    pointLayer(L.lvj, ['==', ['get', 'type'], 'LV_JUNCTION'], radius(2, 2.6, 4.5), token('--c-map-lvj'), token('--c-map-lvj-dark'), LEGEND_MIN_ZOOM.LV_JUNCTION),
    pointLayer(L.kofra, ['==', ['get', 'breaker_role'], 'SERVICE_ENTRY'], radius(2, 2.8, 5), token('--c-map-breaker'), token('--c-map-breaker-dark'), LEGEND_MIN_ZOOM.SERVICE_ENTRY),
    pointLayer(L.transformer, ['==', ['get', 'type'], 'TRANSFORMER'], radius(2.6, 3.6, 6.5), token('--c-map-tr'), token('--c-map-tr-dark'), LEGEND_MIN_ZOOM.TRANSFORMER),
    pointLayer(L.dm, ['==', ['get', 'type'], 'DM'], radius(3.2, 4.4, 8), token('--c-map-dm'), token('--c-map-dm-dark'), LEGEND_MIN_ZOOM.DM),
    pointLayer(L.tm, ['==', ['get', 'type'], 'TM'], radius(5, 7, 12), token('--c-map-tm'), token('--c-map-tm-dark'), LEGEND_MIN_ZOOM.TM),

    // 6. Birim kesicileri — yalnız bina izi açıkken, duvara yayılmış konumlarında.
    {
      id: L.bldBreaker,
      type: 'circle',
      source: NETWORK_SOURCE_ID,
      'source-layer': 'building_breakers',
      minzoom: BUILDING_ZOOM,
      paint: {
        'circle-color': tracedColor(token('--c-map-breaker')),
        'circle-radius': unitTypeMatch(2.8, 2.5, 2.2, 2.2),
        // TM'de tek tek fider kesicisi seçilebilir; seçilen kesici de vurgulanır.
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.6, 1.2],
        'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], token('--c-map-selected'), token('--c-map-breaker-dark')],
      },
    },

  ];
}

/** `feature-state` yazılacak kaynak katmanlar — seçim ve iz bunların hepsinde işaretlenir. */
export const SELECTABLE_SOURCE_LAYERS = ['components', 'building_shapes', 'building_breakers'];

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
 * istemcide sayıya çevrilemez; sunucuda komşuluk grafiğine göre ÖNCEDEN boyanıp (bkz.
 * network-service `db/seed/04-unit-color-band.ts`) `band` kolonunda gelir. İki komşu
 * birim (ör. iki bitişik ilçe) asla aynı bandı taşımaz.
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

// --- İl↔ilçe geçişi ve ilçenin kendi solması --------------------------------------
//
// İki ayrı geçiş var:
// 1. İl→ilçe bindirmesi (z7,5-8,5): il solarken ilçe AYNI ARALIKTA tam tersi yönde belirir.
// 2. İlçenin kendi solması (z13-14): il de aynı şekilde z8,5'te sıfıra indiği için, ilçe de
//    kendi üst ucunda (yerini alacak bir sonraki seviye yokken) aynı doğallıkla solar —
//    sert bir `maxzoom` kesmesi yerine.
//
// Sunucudaki `zoom-lod.ts` bu aralıkların İKİSİNİ de veri olarak sağlamalı — solma z7
// tile'ında BAŞLADIĞI için ilçe verisi z8 değil z7'den itibaren gönderilir, aksi halde
// solma hiç geometri olmadan "havada" hesaplanır ve ilçe z8'de aniden belirir.
const UNIT_FADE_ZOOM_MIN = 7.5;
const UNIT_FADE_ZOOM_MID = 8.5;
const DISTRICT_FADE_OUT_START = 13;
const DISTRICT_FADE_OUT_END = 14;

/**
 * İl/ilçe dolgusunun zoom'a göre solan doğallık opaklığı. `MapView.tsx` "İdari Sınırlar"
 * katmanını kapatıp açarken de AYNI ifadeyi kullanır (bkz. `unitFillOpacity` çağrısı
 * orada) — `visibility: none` yerine bunu `0`'a çekmek, geçişin `fill-opacity-transition`
 * ile solarak çalışmasını sağlar; `visibility` bir layout özelliğidir ve solmaz.
 */
export function unitFillOpacity(theme: 'light' | 'dark', level: 'province' | 'district'): ExpressionSpecification {
  // Pastel bantlar iki temada da açık renktir; koyu zeminde yalnız opaklık düşürülür —
  // koyulaştırılsalar altlıkla birleşip siyah bir lekeye dönüşüyorlardı.
  const bandOpacity = theme === 'dark' ? 0.24 : 0.38;

  if (level === 'province') {
    return ['interpolate', ['linear'], ['zoom'], UNIT_FADE_ZOOM_MIN, bandOpacity, UNIT_FADE_ZOOM_MID, 0];
  }
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    UNIT_FADE_ZOOM_MIN, 0,
    UNIT_FADE_ZOOM_MID, bandOpacity,
    DISTRICT_FADE_OUT_START, bandOpacity,
    DISTRICT_FADE_OUT_END, 0,
  ];
}

// Seçim vurgusu artık sentetik bir GeoJSON poligonundan değil, tile'daki bina izinin
// kendisinden çizilir (bkz. selectedWallFilter) ve düğümlerde `feature-state` ile
// gösterilir — iki ayrı sekizgen üretmenin yarattığı geometri uyuşmazlığı böyle bitti.
