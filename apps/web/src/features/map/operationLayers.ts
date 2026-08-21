import type { Feature, FeatureCollection, Point } from 'geojson';
import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  HeatmapLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { OutageMapItem } from '../../types/outage.ts';
import type { WorkOrderMapItem } from '../../types/work-order.ts';
import { clusterImageIdPrefix, markerImageIdPrefix, type OperationKind } from './markerIcons.ts';
import { token } from './networkLayers.ts';

/**
 * İşletim katmanları — kesintiler ve iş emirleri.
 *
 * Şebeke katmanlarından farklı olarak bunlar **MVT tile'dan gelmez**: durum sürekli değişen
 * bir işletim verisidir ve tile'a gömülürse her durum değişikliğinde tüm tile önbelleği
 * boşalır. Bunun
 * yerine `/outages/map` ve `/work-orders/map` uçlarından gelen hafif özet GeoJSON kaynağı
 * olarak beslenir ve SSE ile tazelenir.
 *
 * ⚠️ **Kayıtlar her zoom'da görünür.** Eskiden kesinti bağlı olduğu elemanın zoom eşiğini
 * miras alıyordu; bir kofra kesintisi z16,5'ten önce hiç çizilmiyordu ve operatör "kaç
 * kesinti var" sorusunu haritadan hiç göremiyordu. Şimdi uzakta yakın kayıtlar **kümeleniyor**
 * (sayı rozeti), yakınlaşınca teker teker açılıyor — 5.000 işaretçiyi z8'de çizmeden.
 */

export const OUTAGE_SOURCE_ID = 'outages';
export const WORK_ORDER_SOURCE_ID = 'work-orders';

/**
 * Isı haritası kendi kaynağını kullanır. Kümelenmiş bir kaynakta ısı haritası küme
 * merkezlerini boyar ve yoğunluk yanlış çıkar; ısı için ham noktalar gerekir.
 */
export const OUTAGE_HEAT_SOURCE_ID = 'outages-heat';

/** Bu zoom'a kadar kümelenir, üstünde kayıtlar teker teker çizilir. */
const CLUSTER_MAX_ZOOM = 14;

/** Aynı kümeye girecek noktaların piksel yarıçapı. */
const CLUSTER_RADIUS = 48;

interface OperationFeatureProps {
  id: string;
  status: string;
  /** Kapsanan kayıt — üsttekinin altında soluk çizilir, müşteri-dakikası ayrıca sayılmaz. */
  covered: boolean;
  /** Sol paneldeki listede seçili satır — işaretçi büyütülerek gösterilir. */
  selected: boolean;
  affectedCustomerCount: number;
}

type OperationFeatureCollection = FeatureCollection<Point, OperationFeatureProps>;

function emptyCollection(): OperationFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

/** Kesinti özetlerini GeoJSON'a çevirir. */
export function toOutageCollection(items: OutageMapItem[] | undefined, selectedId?: string): OperationFeatureCollection {
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
        covered: item.parentOutageId !== null,
        selected: item.id === selectedId,
        affectedCustomerCount: item.affectedCustomerCount ?? 0,
      },
    })),
  };
}

/** İş emri özetlerini GeoJSON'a çevirir. */
export function toWorkOrderCollection(
  items: WorkOrderMapItem[] | undefined,
  selectedId?: string,
): OperationFeatureCollection {
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
        // İş emrinde "kapsanan" (soluk çizilen) kavramı yok — bu, kesintideki
        // `parentOutageId` ile aynı şey DEĞİL: bir iş emrinin kesintiye bağlı olması
        // (`outageId`) normal ve en sık durumdur, neredeyse her işaretçiyi soluklaştırırdı.
        covered: false,
        selected: item.id === selectedId,
        affectedCustomerCount: 0,
      },
    })),
  };
}

/** Kümelenmiş işaretçi kaynağı. */
export function buildOperationSource(data: OperationFeatureCollection): GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data,
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS,
  };
}

/** Isı haritasının ham (kümelenmemiş) kaynağı. */
export function buildHeatSource(data: OperationFeatureCollection): GeoJSONSourceSpecification {
  return { type: 'geojson', data };
}

/** Bir kaynağın küme ve tekil işaretçi katmanlarının kimlikleri. */
export function operationLayerIds(sourceId: string): string[] {
  return [`${sourceId}-cluster`, `${sourceId}-marker`];
}

/**
 * Kesinti/iş emri katmanları: uzakta sayı rozeti, yakında tür ikonlu işaretçi.
 *
 * İkonlar `markerIcons.ts` içinde üretilip haritaya kaydedilir; katman yalnız hangi
 * görselin çizileceğini söyler. `text-field` kullanılmaz — MapLibre'de yazı glyph sunucusu
 * ister, projede dış font sunucusuna bağlanılmıyor.
 */
export function buildOperationLayers(sourceId: string, kind: OperationKind): SymbolLayerSpecification[] {
  const [clusterId, markerId] = operationLayerIds(sourceId) as [string, string];

  return [
    {
      id: clusterId,
      type: 'symbol',
      source: sourceId,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': ['concat', clusterImageIdPrefix(kind), ['to-string', ['get', 'point_count']]],
        // Rozetler birbirini gizlemez: bir bölgede kaç kayıt olduğu tam olarak okunmalı.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      // MapLibre'nin varsayılan 300ms opaklık geçişi KAPATILIR: küme bir kayıt çözülüp
      // dağılınca yalnız KAYBOLURKEN soluyordu, BELİRİRKEN solmuyordu — asimetrik ve
      // dandik duruyordu. İl/ilçe dolgusu dışında haritada solma efekti istenmiyor.
      paint: { 'icon-opacity-transition': { duration: 0 } },
    },
    {
      id: markerId,
      type: 'symbol',
      source: sourceId,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['concat', markerImageIdPrefix(kind), ['get', 'status']],
        // Sivri uç elemanın konumunu gösterir, rozetin gövdesi elemanın ÜSTÜNDE durur.
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': ['case', ['get', 'selected'], 1.25, 1],
      },
      paint: {
        // Kapsanan kayıt soluk çizilir — üstteki kesinti asıl olaydır.
        'icon-opacity': ['case', ['get', 'covered'], 0.55, 1],
        // Aynı sebep: bkz. küme katmanındaki not.
        'icon-opacity-transition': { duration: 0 },
      },
    },
  ];
}

export const OUTAGE_HEATMAP_LAYER_ID = 'outage-heatmap';

/**
 * Isı haritası — kesinti yoğunluğu. Ağırlık etkilenen abone sayısıdır: tek aboneli bir
 * kofra kesintisiyle bin aboneli bir fider kesintisi aynı sıcaklıkta görünmemeli.
 */
export function buildOutageHeatmapLayer(): HeatmapLayerSpecification {
  return {
    id: OUTAGE_HEATMAP_LAYER_ID,
    type: 'heatmap',
    source: OUTAGE_HEAT_SOURCE_ID,
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
      ] as ExpressionSpecification,
    },
  };
}
