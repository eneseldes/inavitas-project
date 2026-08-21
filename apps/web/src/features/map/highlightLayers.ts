import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import { TRACE_ARROW_IMAGE_PREFIX } from './markerIcons.ts';
import { token } from './networkLayers.ts';

/**
 * Vurgu katmanları — haritada "boyanan" her şeyin **tek** yolu.
 *
 * İz (up/down), enerjisizlik, açık kesici ve alan sorgusu sonucu artık ayrı ayrı
 * `setFeatureState` ile ana tile'ın üstüne sürülmüyor; hepsi sunucuda bir **vurgu kümesine**
 * dönüşüyor ve kendi tile'ından, kendi geometrisiyle geliyor
 * (bkz. services/network-service/src/modules/highlight/).
 *
 * Neden ayrı bir kaynak:
 * - Ana tile zoom'a göre eleman **atar** (`TYPE_MIN_ZOOM`) ve `BUS`/`FEEDER`/`LV_BUS`'ı hiç
 *   göndermez. Boyanacak geometri yoksa `setFeatureState` sessizce boşa gider — downstream'de
 *   "eleman gözükmüyor" tam olarak buydu.
 * - Küme tile'ı LOD uygulamaz: her eleman, her zoom'da vardır. Düşük zoom'da sunucu geometriyi
 *   birleştirir, **düşürmez**.
 * - Kesikli çizgi artık bir hile gerektirmiyor: `line-dasharray` veri güdümlü olamadığı için
 *   eskiden her hat katmanının bir "vurgu eşi" (`-emph`) vardı ve 290 bin özellikli katmanlar
 *   ikiye katlanıyordu. Burada rol zaten ayrı bir katman, desen sabit.
 */

/**
 * İki vurgu kaynağı vardır, **aynı** katman kalıbından üretilir:
 *
 * - `highlight-state` — kalıcı işletim durumu: enerjisizlik ve açık kesiciler. Kullanıcı
 *   hiçbir şey yapmasa da orada durur; enerjilenme sürümüyle değişir.
 * - `highlight-query` — kullanıcının açtığı geçici sorgu: iz (up/down) ve alan seçimi.
 *   Panel kapanınca düşer.
 *
 * Neden iki kaynak ve tek katman kalıbı: iki kümenin **token'ı** ayrı yerden gelir ve bir
 * vector kaynağı tek bir tile şablonu taşır. Görsel kural ise tek: sorgu, durumu **ezer**
 * — ama bunu ifadeyle değil **çizim sırasıyla** anlatırız. `query` katmanları `state`
 * katmanlarının üstündedir, dolayısıyla sorgunun DIŞINDA kalan enerjisiz bölge görünmeye
 * devam eder (eski `feature-state` kuralında iz açıkken enerjisizlik büsbütün kayboluyordu).
 */
export const HIGHLIGHT_STATE_SOURCE_ID = 'highlight-state';
export const HIGHLIGHT_QUERY_SOURCE_ID = 'highlight-query';

/** Sunucudaki MVT katman adı (bkz. highlight/tile.ts `HIGHLIGHT_SOURCE_LAYER`). */
const HIGHLIGHT_SOURCE_LAYER = 'highlight';

/** Vurgu rolleri — sunucudaki `HIGHLIGHT_ROLES` ile aynı olmalı. */
export type HighlightRole = 'up' | 'down' | 'dead' | 'open' | 'area';

/** Bir kaynağın katman kimlikleri; çizim sırasıyla. */
export function highlightLayerIds(sourceId: string): string[] {
  return [`${sourceId}-halo`, `${sourceId}-dash`, `${sourceId}-line`, `${sourceId}-arrow`, `${sourceId}-point`];
}

/**
 * İki vurgu kaynağının çizim sırasını veren çapa listeleri.
 *
 * MapLibre'de `addLayer(layer, beforeId)` katmanı `beforeId`'nin **altına** koyar. İki kaynak
 * birbirinden bağımsız zamanlarda kurulduğu için (hangisinin token'ı önce gelir, kullanıcının
 * hangi paneli açtığına bağlı) tek bir çapa yetmez: liste **aday** listesidir, var olan ilk
 * katman kullanılır.
 *
 * Kural: `state` (enerjisizlik) `query`nin (iz/alan) **altına** girer, ikisi de
 * `sharedAnchor`ın altında kalır. `sharedAnchor` çağıranın verdiği ortak tavandır — bugün ısı
 * haritası katmanı, yani kesinti/iş emri rozetlerinin hemen altı. Rozetler böylece her zaman
 * en üstte kalır: nokta işaretçisi üstünden geçen bir hat tarafından örtülmemeli.
 *
 * Parametre olarak alınmasının sebebi bağımlılık yönü: bu dosya vurgu katmanlarının kimliğini
 * bilir, işletim katmanlarınınkini bilmek zorunda değil.
 */
export function highlightAnchors(sharedAnchor: string): {
  state: readonly string[];
  query: readonly string[];
} {
  return {
    state: [highlightLayerIds(HIGHLIGHT_QUERY_SOURCE_ID)[0]!, sharedAnchor],
    query: [sharedAnchor],
  };
}

/**
 * Akış yönü oklarının yalnız İZ rollerinde çizilmesinin sebebi: yön bilgisi ancak
 * kullanıcının açtığı bir sorguda anlamlıdır. Enerjisizlik (`dead`/`open`) bir yön değil bir
 * durumdur, alan seçimi (`area`) ise topolojik bile değil.
 *
 * Okun yönü geometrinin **çizim yönünden** gelir (`symbol-placement: 'line'` sembolü hattın
 * ilk noktasından son noktasına doğru döndürür). Bu, veri setinde akış yönüyle aynıdır:
 * MV hattı TM'de BAŞLAR, DM/trafoda BİTER; irtibat hattı buattan kofraya gider
 * (bkz. network-service tiles/service.ts `unit_breakers` yorumları). Dolayısıyla ok her iki
 * izde de **elektriğin aktığı yönü** gösterir — upstream'de "kaynaktan bana", downstream'de
 * "benden aşağıya".
 */
const TRACE_ROLES: readonly HighlightRole[] = ['up', 'down'];

const IS_LINE: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const IS_POINT: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Rol → renk. Tek yerde durur; dört katman da buradan boyanır. */
function roleColor(): ExpressionSpecification {
  return [
    'match',
    ['get', 'role'],
    'up', token('--c-map-trace-up'),
    'down', token('--c-map-trace-down'),
    'open', token('--c-map-deenergized'),
    'area', token('--c-map-selected'),
    // 'dead' ve bilinmeyen
    token('--c-map-deenergized'),
  ];
}

/**
 * Tip → taban kalınlık. Ana katmanların genişlikleriyle (networkLayers.ts `lineLayerSpecs`)
 * aynı sırayı korur: vurgu, altındaki hattı örtecek kadar kalın olmalı ama HV ile AG'yi
 * aynı kalınlıkta çizmemeli.
 */
function widthByType(scale: number): ExpressionSpecification {
  return [
    '*',
    scale,
    ['match', ['get', 'type'], 'HV_LINE', 3.2, 'HV_LINK', 3.2, 'MV_LINE', 2.6, 'MV_TIE_LINE', 2, 'MV_BRANCH', 1.6, 'SERVICE_DROP', 1, 1.2] as ExpressionSpecification,
  ];
}

/**
 * Vurgu kaynağı **yalnız token varken** kurulur ve token değişince baştan kurulur.
 *
 * Kalıcı bir kaynak tutup `setTiles` ile token'ı değiştirmek denendi ve terk edildi:
 * MapLibre kaynağın tile şablonunu bir sonraki **animasyon karesinde** güncelliyor
 * (`VectorTileSource.load()` bir `requestAnimationFrame` bekler), o kareye kadar hâlâ eski
 * şablonla istek atıyor. Sonuç: token yokken yer tutucuya giden 410'lar, token değişince
 * bir tur eski kümenin tile'ları. Kaynağı token'la birlikte var edip yok etmek bu pencereyi
 * tamamen kapatır ve "vurgu yoksa tek bir istek bile çıkmaz" kuralını kesinleştirir.
 */
export function buildHighlightSource(setToken: string): VectorSourceSpecification {
  return {
    type: 'vector',
    tiles: [`${window.location.origin}/api/network/tiles/set/${setToken}/{z}/{x}/{y}.mvt`],
    minzoom: 0,
    maxzoom: 20,
  };
}

/**
 * Katmanlar çizim sırasıyla: halo → kesik → gövde → akış oku → nokta.
 *
 * Hiçbirinde `minzoom` **yoktur** — vurgunun bütün amacı zoom'dan bağımsız olmasıdır.
 * Görünürlük anahtarı da yoktur: katmanlar kaynağıyla birlikte var olur, kaynağıyla
 * birlikte gider.
 */
export function buildHighlightLayers(sourceId: string): LayerSpecification[] {
  const color = roleColor();
  const [haloId, dashId, lineId, arrowId, pointId] = highlightLayerIds(sourceId) as [
    string,
    string,
    string,
    string,
    string,
  ];

  const halo: LineLayerSpecification = {
    id: haloId,
    type: 'line',
    source: sourceId,
    'source-layer': HIGHLIGHT_SOURCE_LAYER,
    filter: IS_LINE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': widthByType(3.4),
      'line-opacity': 0.22,
      'line-blur': 2,
    },
  };

  // Kesik desen yalnız enerjisizlikte: iz, kullanıcının kendi açtığı geçici bir sorgudur ve
  // düz çizilir — eski `emphasisLayer`'daki "iz açıkken kesik düşer" kuralının karşılığı.
  const dash: LineLayerSpecification = {
    id: dashId,
    type: 'line',
    source: sourceId,
    'source-layer': HIGHLIGHT_SOURCE_LAYER,
    filter: ['all', IS_LINE, ['in', ['get', 'role'], ['literal', ['dead', 'open']]]],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': token('--c-map-deenergized'),
      'line-width': widthByType(2.2),
      'line-dasharray': [2.5, 1.75],
      'line-opacity': 0.95,
    },
  };

  const line: LineLayerSpecification = {
    id: lineId,
    type: 'line',
    source: sourceId,
    'source-layer': HIGHLIGHT_SOURCE_LAYER,
    filter: IS_LINE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': widthByType(1.6),
      'line-opacity': 1,
    },
  };

  // Akış yönü okları — gövdenin üstünde, noktaların altında.
  const arrow: SymbolLayerSpecification = {
    id: arrowId,
    type: 'symbol',
    source: sourceId,
    'source-layer': HIGHLIGHT_SOURCE_LAYER,
    filter: ['all', IS_LINE, ['in', ['get', 'role'], ['literal', [...TRACE_ROLES]]]],
    layout: {
      // Görsel `markerIcons.ts`'te rol başına ÜRETİLİR; `icon-color` yalnız SDF görselde
      // çalıştığı için renk ikonun kendisine gömülüdür.
      'icon-image': ['concat', TRACE_ARROW_IMAGE_PREFIX, ['get', 'role']],
      'symbol-placement': 'line',
      // Aralık piksel cinsindendir: uzun bir MV hattında bile birkaç ok düşer, kısa bir
      // kolda tek ok kalır — hat okla dolup çizgiyi bastırmaz.
      'symbol-spacing': 120,
      'icon-rotation-alignment': 'map',
      // ⚠️ `icon-keep-upright` VARSAYILAN (false) bırakılır: true olsaydı MapLibre okları
      // "okunur" kalsın diye çevirir ve ok yönü — yani bu katmanın tek anlamı — bozulurdu.
      'icon-allow-overlap': false,
      'icon-ignore-placement': false,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 14, 0.8, 18, 1],
    },
    paint: {
      // Sembol solması haritanın hiçbir yerinde istenmiyor (bkz. operationLayers.ts).
      'icon-opacity-transition': { duration: 0 },
    },
  };

  const point: CircleLayerSpecification = {
    id: pointId,
    type: 'circle',
    source: sourceId,
    'source-layer': HIGHLIGHT_SOURCE_LAYER,
    filter: IS_POINT,
    paint: {
      // "Açık kontak": kesici üstünden beslendiği için enerjilidir, içi boşaltılıp konturu
      // kırmızı çizilir. Diğer roller dolu daire.
      'circle-color': ['case', ['==', ['get', 'role'], 'open'], token('--c-map-bg'), color],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.2, 14, 3.4, 20, 6],
      'circle-stroke-width': ['case', ['==', ['get', 'role'], 'open'], 2.2, 1],
      'circle-stroke-color': color,
      'circle-opacity': 0.95,
    },
  };

  return [halo, dash, line, arrow, point];
}
