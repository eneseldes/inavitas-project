import type { FeatureCollection, Point } from 'geojson';
import type { LayerSpecification, Map as MapLibreMap, SymbolLayerSpecification } from 'maplibre-gl';
import type { UnitLabel } from './api.ts';
import { token } from './networkLayers.ts';

/**
 * İl ve ilçe adları.
 *
 * Eskiden HTML işaretçisiydi; MapLibre işaretçileri tuvalin ÜSTÜNDEKİ bir DOM katmanında
 * durduğu için adlar şebeke elemanlarının ve kesinti rozetlerinin üstünü kapatıyordu.
 * Artık normal bir `symbol` katmanı: adlar tuvale çizilir ve katman sırasına uyar
 * (il/ilçe renklerinin üstünde, diğer her şeyin altında).
 *
 * Yazı `text-field` ile değil resimle çizilir — `text-field` glyph sunucusu ister, projede
 * dış font sunucusuna bağlanılmıyor (bkz. markerIcons.ts).
 */

export const UNIT_LABEL_SOURCE_ID = 'unit-labels';

const PROVINCE_LAYER_ID = 'unit-label-province';
const DISTRICT_LAYER_ID = 'unit-label-district';

export const UNIT_LABEL_LAYER_IDS = [PROVINCE_LAYER_ID, DISTRICT_LAYER_ID];

/** İl adı bu zoom'un altında, ilçe adları arasında görünür; üstünde ikisi de kaybolur. */
const DISTRICT_ZOOM = 8;
const LABEL_MAX_ZOOM = 13;

/** Retina ekranda bulanıklaşmasın diye görseller iki katı çözünürlükte üretilir. */
const PIXEL_RATIO = 2;

/**
 * Adın altlık üzerinde okunmasını sağlayan yumuşak parıltı — eski CSS'teki
 * `text-shadow: 0 0 3px, 0 0 6px` ile aynı iki yarıçap. Sert bir dış hat (`strokeText`)
 * yazının etrafında beyaz bir kalıp bırakıyordu.
 */
const GLOW_BLUR_RADII = [3, 6];

/** En geniş parıltının resmin dışına taşmaması için bırakılan boşluk. */
const GLOW_PADDING = 8;

interface LabelStyle {
  fontSize: number;
  letterSpacing: string;
  uppercase: boolean;
}

const PROVINCE_STYLE: LabelStyle = { fontSize: 16, letterSpacing: '0.08em', uppercase: true };
const DISTRICT_STYLE: LabelStyle = { fontSize: 12, letterSpacing: '0.02em', uppercase: false };

function imageIdOf(unit: UnitLabel): string {
  return `unit-label-${unit.path}`;
}

/** Bir birim adını yazı resmine çevirip haritaya kaydeder. */
function addLabelImage(map: MapLibreMap, unit: UnitLabel, style: LabelStyle): void {
  const text = style.uppercase ? unit.name.toLocaleUpperCase('tr-TR') : unit.name;
  const font = `600 ${style.fontSize}px system-ui, sans-serif`;

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return;
  measure.font = font;
  measure.letterSpacing = style.letterSpacing;
  const width = Math.ceil(measure.measureText(text).width) + GLOW_PADDING * 2;
  const height = Math.ceil(style.fontSize * 1.4) + GLOW_PADDING * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * PIXEL_RATIO;
  canvas.height = height * PIXEL_RATIO;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);

  ctx.font = font;
  ctx.letterSpacing = style.letterSpacing;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = token('--c-ink');

  const x = width / 2;
  const y = height / 2;

  // Parıltı katmanları: her yarıçap iki kez çizilir — tek geçiş CSS'teki yoğunluğun
  // altında kalıyor, üst üste binince aynı yumuşak halkaya oturuyor.
  ctx.shadowColor = token('--c-surface');
  for (const blur of GLOW_BLUR_RADII) {
    ctx.shadowBlur = blur;
    ctx.fillText(text, x, y);
    ctx.fillText(text, x, y);
  }

  // Net yazı en üste, gölgesiz.
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.fillText(text, x, y);

  const id = imageIdOf(unit);
  if (map.hasImage(id)) map.removeImage(id);
  map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: PIXEL_RATIO });
}

export interface UnitLabelSet {
  provinces: UnitLabel[];
  districts: UnitLabel[];
}

/**
 * Ad görsellerini kaydeder. Renkler temadan geldiği için tema değişince katmanlarla
 * birlikte yeniden üretilirler.
 */
export function registerUnitLabelImages(map: MapLibreMap, labels: UnitLabelSet): void {
  for (const unit of labels.provinces) addLabelImage(map, unit, PROVINCE_STYLE);
  for (const unit of labels.districts) addLabelImage(map, unit, DISTRICT_STYLE);
}

export function toUnitLabelCollection(labels: UnitLabelSet): FeatureCollection<Point> {
  const toFeature = (unit: UnitLabel, level: 'PROVINCE' | 'DISTRICT') => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [unit.centerLon!, unit.centerLat!] },
    properties: { level, imageId: imageIdOf(unit) },
  });

  return {
    type: 'FeatureCollection',
    features: [
      ...labels.provinces.map((unit) => toFeature(unit, 'PROVINCE')),
      ...labels.districts.map((unit) => toFeature(unit, 'DISTRICT')),
    ],
  };
}

/**
 * Ad katmanları. Çakışma elemesi kapalı: adlar birbirini gizlemez, eskiden HTML
 * işaretçisiyle de gizlemiyordu.
 */
export function buildUnitLabelLayers(): LayerSpecification[] {
  const layout: SymbolLayerSpecification['layout'] = {
    'icon-image': ['get', 'imageId'],
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  };

  return [
    {
      id: PROVINCE_LAYER_ID,
      type: 'symbol',
      source: UNIT_LABEL_SOURCE_ID,
      layout,
      filter: ['==', ['get', 'level'], 'PROVINCE'],
      maxzoom: DISTRICT_ZOOM,
    },
    {
      id: DISTRICT_LAYER_ID,
      type: 'symbol',
      source: UNIT_LABEL_SOURCE_ID,
      layout,
      filter: ['==', ['get', 'level'], 'DISTRICT'],
      minzoom: DISTRICT_ZOOM,
      maxzoom: LABEL_MAX_ZOOM,
    },
  ];
}
