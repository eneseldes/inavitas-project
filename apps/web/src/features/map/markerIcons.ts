import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiTool, FiZap } from 'react-icons/fi';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { token } from './networkLayers.ts';

/**
 * Kesinti ve iş emri işaretçilerinin görselleri.
 *
 * Bunlar nokta (`circle`) olarak çizilemez: şebeke düğümleri de nokta ve ikisi üst üste
 * gelince hangisinin kayıt hangisinin eleman olduğu okunmuyordu. İşaretçi bunun yerine
 * köşeleri yuvarlatılmış, içinde türün ikonunu taşıyan ve elemanın **üstünde** duran bir
 * rozettir; sivri ucu tam elemanın konumunu gösterir.
 *
 * ⚠️ Ekranda yazı gerektiren her şey (küme sayısı) bu dosyada resme çevrilir. MapLibre'nin
 * `text-field`'ı glyph sunucusu ister; projede dış font sunucusuna bağlanılmıyor.
 */

/** İşaretçinin gövde ölçüleri (CSS pikseli); `pixelRatio: 2` ile iki katı çözünürlükte üretilir. */
const BODY_SIZE = 30;
const CORNER_RADIUS = 9;
const TAIL_HEIGHT = 6;
const TAIL_HALF_WIDTH = 5;
const ICON_SIZE = 16;
const STROKE_WIDTH = 2;

/** Retina ekranda bulanıklaşmasın diye görseller iki katı çözünürlükte üretilir. */
const PIXEL_RATIO = 2;

export type OperationKind = 'outage' | 'workOrder';

/**
 * Görsel kimlikleri. Katman ifadesi kimliği parça parça birleştirdiği (`concat`) ve
 * `addClusterImage` onu geri ayrıştırdığı için biçim tek yerde tanımlıdır.
 */
export function markerImageIdPrefix(kind: OperationKind): string {
  return `op-marker-${kind}-`;
}

export function markerImageId(kind: OperationKind, status: string): string {
  return `${markerImageIdPrefix(kind)}${status}`;
}

/** Küme rozetinin kimliği; sayı ikon adının sonunda taşınır (bkz. `styleimagemissing`). */
export function clusterImageIdPrefix(kind: OperationKind): string {
  return `op-cluster-${kind}-`;
}

/**
 * O ana kadar üretilmiş küme rozetleri. Tema değişiminde silinmeleri gerekir: kayıtlı bir
 * görsel için `styleimagemissing` bir daha ateşlenmez, silinmezlerse rozetler eski temanın
 * renginde kalırdı.
 */
const registeredClusterImages = new Set<string>();

/**
 * Bu aralıktaki küme sayıları `registerMarkerImages` ile ÖNCEDEN çizilir. `styleimagemissing`
 * yine de her sayı için çalışır (üsttekini aşan büyük kümeler için) ama küçük sayılar en sık
 * karşılaşılanlardır — bunlar önceden hazır olmazsa her YENİ görülen küçük sayı için bir kare
 * boyunca rozet hiç çizilmiyor, sonra beliriyordu; sürekli zoom'da "bir kaybolup bir görünme"
 * hissi büyük ölçüde buradan geliyordu.
 */
const PRE_REGISTERED_CLUSTER_COUNTS = 30;

/** Durum → renk token'ı. Katman ifadeleriyle aynı eşleme, tek yerde. */
const OUTAGE_STATUS_TOKEN: Record<string, string> = {
  STARTED: '--c-map-outage-started',
  ENERGIZED: '--c-map-outage-energized',
  ARCHIVED: '--c-map-outage-archived',
  CANCELLED: '--c-map-outage-cancelled',
};

const WORK_ORDER_STATUS_TOKEN: Record<string, string> = {
  STARTED: '--c-map-wo-started',
  ASSIGNED: '--c-map-wo-assigned',
  IN_PROGRESS: '--c-map-wo-in-progress',
  ENERGIZED: '--c-map-wo-energized',
  DONE: '--c-map-wo-done',
  CANCELLED: '--c-map-wo-cancelled',
};

export const OPERATION_STATUS_TOKENS: Record<OperationKind, Record<string, string>> = {
  outage: OUTAGE_STATUS_TOKEN,
  workOrder: WORK_ORDER_STATUS_TOKEN,
};

/**
 * Rozet gövdesinin yolu: köşeleri yuvarlatılmış kare + altında elemanı işaret eden sivri uç.
 * Sol üst köşe (0,0); toplam yükseklik `BODY_SIZE + TAIL_HEIGHT`.
 */
function bodyPath(): string {
  const s = BODY_SIZE;
  const r = CORNER_RADIUS;
  const mid = s / 2;
  return [
    `M ${r} 0`,
    `H ${s - r}`,
    `A ${r} ${r} 0 0 1 ${s} ${r}`,
    `V ${s - r}`,
    `A ${r} ${r} 0 0 1 ${s - r} ${s}`,
    `H ${mid + TAIL_HALF_WIDTH}`,
    `L ${mid} ${s + TAIL_HEIGHT}`,
    `L ${mid - TAIL_HALF_WIDTH} ${s}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${s - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

/** İkonun kendisi react-icons'tan gelir; SVG işaretlemesi olarak gömülür. */
function iconMarkup(kind: OperationKind): string {
  return renderToStaticMarkup(createElement(kind === 'outage' ? FiZap : FiTool));
}

/** Rozet SVG'sinin markup'ı — harita için rasterize edilir, panel için doğrudan gömülür. */
export function markerSvg(kind: OperationKind, fill: string, stroke: string, ink: string): string {
  const width = BODY_SIZE + STROKE_WIDTH;
  const height = BODY_SIZE + TAIL_HEIGHT + STROKE_WIDTH;
  const half = STROKE_WIDTH / 2;
  const iconOffset = (BODY_SIZE - ICON_SIZE) / 2;

  // react-icons ikonu `width/height="1em"` ve `stroke="currentColor"` ile gelir: boyutu
  // `font-size`, rengi `color` belirler. Bu yüzden ikon işaretlemesine hiç dokunulmaz.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-half} ${-half} ${width} ${height}">
  <path d="${bodyPath()}" fill="${fill}" stroke="${stroke}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>
  <g transform="translate(${iconOffset} ${iconOffset})" font-size="${ICON_SIZE}" color="${ink}">${iconMarkup(kind)}</g>
</svg>`;
}

/** SVG işaretlemesini tarayıcıya çizdirip haritanın kullanabileceği bir görsele çevirir. */
function loadSvgImage(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(width * PIXEL_RATIO, height * PIXEL_RATIO);
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('işaretçi görseli çizilemedi'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Tüm durum işaretçilerini haritaya kaydeder. Tema değişiminde token'lar başka renge
 * çözüldüğü için görseller de yeniden üretilir — bu yüzden katmanlarla birlikte çağrılır.
 */
export async function registerMarkerImages(map: MapLibreMap): Promise<void> {
  for (const imageId of registeredClusterImages) {
    if (map.hasImage(imageId)) map.removeImage(imageId);
  }
  registeredClusterImages.clear();

  const stroke = token('--c-map-op-stroke');
  const ink = token('--c-map-marker-ink');
  const width = BODY_SIZE + STROKE_WIDTH;
  const height = BODY_SIZE + TAIL_HEIGHT + STROKE_WIDTH;

  const entries = (Object.keys(OPERATION_STATUS_TOKENS) as OperationKind[]).flatMap((kind) =>
    Object.entries(OPERATION_STATUS_TOKENS[kind]).map(([status, colorToken]) => ({
      id: markerImageId(kind, status),
      svg: markerSvg(kind, token(colorToken), stroke, ink),
    })),
  );

  const images = await Promise.all(entries.map((entry) => loadSvgImage(entry.svg, width, height)));

  entries.forEach((entry, index) => {
    // Tema değişiminde aynı kimlik yeniden üretilir; MapLibre çift kayda hata verir.
    if (map.hasImage(entry.id)) map.removeImage(entry.id);
    map.addImage(entry.id, images[index]!, { pixelRatio: PIXEL_RATIO });
  });

  // Sık görülen küme sayılarını önceden çiz — bkz. `PRE_REGISTERED_CLUSTER_COUNTS` yorumu.
  for (const kind of Object.keys(OPERATION_STATUS_TOKENS) as OperationKind[]) {
    for (let count = 2; count <= PRE_REGISTERED_CLUSTER_COUNTS; count++) {
      addClusterImage(map, `${clusterImageIdPrefix(kind)}${count}`);
    }
  }
}

/**
 * Küme rozetini **istendiği anda** üretir. Sayı sınırsız olduğundan tüm olasılıkları önceden
 * kaydetmek mümkün değil; MapLibre eksik görseli `styleimagemissing` ile bildirir, biz de o
 * anda çizip ekleriz. Rozet tuvale çizilir (SVG değil): eşzamanlı üretilir ve yazı tipi
 * sistemden gelir, dış bir font sunucusuna ihtiyaç duymaz.
 */
export function addClusterImage(map: MapLibreMap, imageId: string): void {
  const parsed = /^op-cluster-(outage|workOrder)-(\d+)$/.exec(imageId);
  if (!parsed) return;

  const kind = parsed[1] as OperationKind;
  // Sayı kısaltılmaz ("1,2B" gibi bir ek dile bağlı olurdu ve bu görsel çeviriden geçmez);
  // rozet bunun yerine hane sayısına göre büyür.
  const label = parsed[2]!;
  const fill = token(kind === 'outage' ? '--c-map-outage-cluster' : '--c-map-wo-cluster');
  const stroke = token('--c-map-op-stroke');
  const ink = token('--c-map-marker-ink');

  // Yarıçap hane sayısıyla büyür: "9" ile "1284" aynı daireye sığmaz.
  const radius = 12 + label.length * 2.5;
  const size = Math.ceil((radius + STROKE_WIDTH) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size * PIXEL_RATIO;
  canvas.height = size * PIXEL_RATIO;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);

  const center = size / 2;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = STROKE_WIDTH;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(radius * 0.85)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, center, center);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (map.hasImage(imageId)) map.removeImage(imageId);
  map.addImage(imageId, data, { pixelRatio: PIXEL_RATIO });
  registeredClusterImages.add(imageId);
}
