import type { Feature, FeatureCollection, Point } from 'geojson';
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  HeatmapLayerSpecification,
  LayerSpecification,
} from 'maplibre-gl';
import type { OutageMapItem } from '../../types/outage.ts';
import type { WorkOrderMapItem } from '../../types/work-order.ts';
import { LEGEND_MIN_ZOOM, token } from './networkLayers.ts';

/**
 * İşletim katmanları — kesintiler ve iş emirleri.
 *
 * Şebeke katmanlarından farklı olarak bunlar **MVT tile'dan gelmez**: durum sürekli değişen
 * bir işletim verisidir ve tile'a gömülürse her manevrada tüm tile önbelleği boşalır. Bunun
 * yerine `/outages/map` ve `/work-orders/map` uçlarından gelen hafif özet GeoJSON kaynağı
 * olarak beslenir ve SSE ile tazelenir.
 */

export const OUTAGE_SOURCE_ID = 'outages';
export const WORK_ORDER_SOURCE_ID = 'work-orders';

/**
 * Bir kesintinin/iş emrinin çizileceği en küçük zoom, bağlı olduğu **elemanın** eşiğidir:
 * kofra ölçeğindeki bir kesinti z16,5'ten önce görünmez, sessizce boş kalmaz.
 *
 * `CIRCUIT_BREAKER` tek başına bir ölçek bildirmez — TM fider kesicisi de kofra kesicisi de
 * aynı tiptedir; bu yüzden kesicilerde `breaker_role` belirleyicidir.
 */
const TYPE_ZOOM: Record<string, number> = {
  TM: LEGEND_MIN_ZOOM.TM,
  BUS: LEGEND_MIN_ZOOM.TM,
  HV_LINE: LEGEND_MIN_ZOOM.HV_LINE,
  HV_LINK: LEGEND_MIN_ZOOM.HV_LINE,
  FEEDER: LEGEND_MIN_ZOOM.MV_MAIN,
  MV_LINE: LEGEND_MIN_ZOOM.MV_MAIN,
  MV_TIE_LINE: LEGEND_MIN_ZOOM.MV_MAIN,
  DM: LEGEND_MIN_ZOOM.DM,
  MV_BRANCH: LEGEND_MIN_ZOOM.MV_BRANCH,
  TRANSFORMER: LEGEND_MIN_ZOOM.TRANSFORMER,
  LV_BUS: LEGEND_MIN_ZOOM.LV_JUNCTION,
  LV_LINE: LEGEND_MIN_ZOOM.LV_LINE,
  LV_JUNCTION: LEGEND_MIN_ZOOM.LV_JUNCTION,
  SERVICE_DROP: LEGEND_MIN_ZOOM.SERVICE_ENTRY,
};

const BREAKER_ROLE_ZOOM: Record<string, number> = {
  TM_FEEDER: LEGEND_MIN_ZOOM.TM,
  TIE: LEGEND_MIN_ZOOM.MV_MAIN,
  DM_ENTRY: LEGEND_MIN_ZOOM.DM,
  TRANSFORMER: LEGEND_MIN_ZOOM.TRANSFORMER,
  SERVICE_ENTRY: LEGEND_MIN_ZOOM.SERVICE_ENTRY,
};

/** Zoom kovaları — her biri kendi `minzoom`'una sahip ayrı bir MapLibre katmanı olur. */
const ZOOM_BUCKETS = [
  LEGEND_MIN_ZOOM.TM,
  LEGEND_MIN_ZOOM.DM,
  LEGEND_MIN_ZOOM.TRANSFORMER,
  LEGEND_MIN_ZOOM.LV_JUNCTION,
  LEGEND_MIN_ZOOM.SERVICE_ENTRY,
] as const;

/** Elemanın tip/rolüne göre kaydın görüneceği en küçük zoom'u döner. */
export function resolveMinZoom(componentType: string, breakerRole: string | null): number {
  if (breakerRole && BREAKER_ROLE_ZOOM[breakerRole] !== undefined) return BREAKER_ROLE_ZOOM[breakerRole]!;
  // Bilinmeyen tip en geç açılan kovaya düşer: erken çizip yanlış ölçekte göstermektense
  // yakınlaşınca göstermek doğrudur.
  return TYPE_ZOOM[componentType] ?? LEGEND_MIN_ZOOM.SERVICE_ENTRY;
}

/** En yakın (küçük veya eşit) zoom kovasını bulur — katman ataması bunun üzerinden yapılır. */
function bucketOf(minZoom: number): number {
  let bucket = ZOOM_BUCKETS[0]!;
  for (const candidate of ZOOM_BUCKETS) {
    if (minZoom >= candidate) bucket = candidate;
  }
  return bucket;
}

interface OperationFeatureProps {
  id: string;
  status: string;
  /** Kapsanan kayıt — üsttekinin altında soluk çizilir, müşteri-dakikası ayrıca sayılmaz. */
  covered: boolean;
  affectedCustomerCount: number;
  bucket: number;
}

type OperationFeatureCollection = FeatureCollection<Point, OperationFeatureProps>;

function emptyCollection(): OperationFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

/** Kesinti özetlerini GeoJSON'a çevirir. */
export function toOutageCollection(items: OutageMapItem[] | undefined): OperationFeatureCollection {
  if (!items) return emptyCollection();

  return {
    type: 'FeatureCollection',
    features: items.map((item): Feature<Point, OperationFeatureProps> => ({
      type: 'Feature',
      // `id` sayısal veya string olmalı; `feature-state` bununla eşleşir.
      id: item.id,
      geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
      properties: {
        id: item.id,
        status: item.status,
        covered: item.parentOutageId !== null,
        affectedCustomerCount: item.affectedCustomerCount ?? 0,
        bucket: bucketOf(resolveMinZoom(item.componentType, item.breakerRole)),
      },
    })),
  };
}

/** İş emri özetlerini GeoJSON'a çevirir. */
export function toWorkOrderCollection(items: WorkOrderMapItem[] | undefined): OperationFeatureCollection {
  if (!items) return emptyCollection();

  return {
    type: 'FeatureCollection',
    features: items.map((item): Feature<Point, OperationFeatureProps> => ({
      type: 'Feature',
      id: item.id,
      geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
      properties: {
        id: item.id,
        status: item.status,
        covered: item.outageId !== null,
        affectedCustomerCount: 0,
        bucket: bucketOf(resolveMinZoom(item.componentType, item.breakerRole)),
      },
    })),
  };
}

export function buildOperationSource(data: OperationFeatureCollection): GeoJSONSourceSpecification {
  return { type: 'geojson', data };
}

/** Kesinti noktası durum rengiyle çizilir — rozetlerdeki `StatusBadge` renkleriyle aynı token. */
function outageStatusColor(): ExpressionSpecification {
  return [
    'match',
    ['get', 'status'],
    'STARTED', token('--c-map-outage-started'),
    'ENERGIZED', token('--c-map-outage-energized'),
    'ARCHIVED', token('--c-map-outage-archived'),
    token('--c-map-outage-cancelled'),
  ];
}

function workOrderStatusColor(): ExpressionSpecification {
  return [
    'match',
    ['get', 'status'],
    'STARTED', token('--c-map-wo-started'),
    'ASSIGNED', token('--c-map-wo-assigned'),
    'IN_PROGRESS', token('--c-map-wo-in-progress'),
    'ENERGIZED', token('--c-map-wo-energized'),
    'DONE', token('--c-map-wo-done'),
    token('--c-map-wo-cancelled'),
  ];
}

/** Bir kaynak için zoom kovası başına bir katman kimliği üretir. */
export function operationLayerIds(sourceId: string): string[] {
  return ZOOM_BUCKETS.map((bucket) => `${sourceId}-z${String(bucket).replace('.', '_')}`);
}

export const OUTAGE_HEATMAP_LAYER_ID = 'outage-heatmap';

/**
 * Kesinti/iş emri katmanları. Her zoom kovası ayrı bir katmandır: MapLibre `filter`
 * ifadesinde zoom'a güvenilemediğinden eşik `minzoom` ile uygulanır — bina izi ve şebeke
 * katmanlarındaki desenin aynısı.
 */
export function buildOperationLayers(sourceId: string, kind: 'outage' | 'workOrder'): LayerSpecification[] {
  const color = kind === 'outage' ? outageStatusColor() : workOrderStatusColor();
  const stroke = token('--c-map-op-stroke');

  return ZOOM_BUCKETS.map((bucket, index): CircleLayerSpecification => {
    return {
      id: operationLayerIds(sourceId)[index]!,
      type: 'circle',
      source: sourceId,
      minzoom: bucket,
      // Kova aralığı kapalı-açık: bir kayıt yalnız kendi kovasının katmanında çizilir,
      // yoksa üst kovalar aynı noktayı ikinci kez boyar.
      filter: ['==', ['get', 'bucket'], bucket],
      paint: {
        'circle-color': color,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 8, 20, 13],
        // Kapsanan kayıt soluk çizilir — üstteki kesinti asıl olaydır.
        'circle-opacity': ['case', ['get', 'covered'], 0.4, 0.9],
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          token('--c-map-selected'),
          stroke,
        ],
      },
    };
  });
}

/**
 * Isı haritası — kesinti yoğunluğu. Ağırlık etkilenen abone sayısıdır: tek aboneli bir
 * kofra kesintisiyle bin aboneli bir fider kesintisi aynı sıcaklıkta görünmemeli.
 */
export function buildOutageHeatmapLayer(): HeatmapLayerSpecification {
  return {
    id: OUTAGE_HEATMAP_LAYER_ID,
    type: 'heatmap',
    source: OUTAGE_SOURCE_ID,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'affectedCustomerCount'], 0, 0.1, 500, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 1, 16, 3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 16, 40],
      'heatmap-opacity': 0.7,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, token('--c-map-heat-zero'),
        0.3, token('--c-map-heat-low'),
        0.6, token('--c-map-heat-mid'),
        1, token('--c-map-heat-high'),
      ],
    },
  };
}
