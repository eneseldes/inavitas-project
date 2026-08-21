/**
 * `network-service`'e özgü metrikler.
 *
 * Ortak HTTP metrikleri `@inavitas/shared/metrics` içinde tanımlıdır ve her serviste aynıdır;
 * burada yalnız bu servisin **kendi** ağır işleri ölçülür. Ölçülen üç şey, kabul
 * ölçütlerindeki üç hedefin birebir karşılığıdır (bkz. `onceden-yapilanlar.md` §13.2):
 *
 * | Metrik | Hedef |
 * |---|---|
 * | `network_tile_render_seconds` + `network_tile_cache_total` | cache-hit < 30 ms · miss < 400 ms |
 * | `network_graph_traverse_seconds` | downstream (10k düğüm) < 50 ms |
 * | `network_area_query_seconds` | poligon sorgusu |
 *
 * Kova sınırları varsayılandan **daha sıkıdır**: varsayılan dizinin ilk kovası 5 ms'tir ve
 * cache'ten dönen bir tile'ın tamamı o kovaya düşerdi — yani p95 ölçülemezdi.
 */

import { counter, gauge, histogram } from '@inavitas/shared';

/** Milisaniye ölçeğindeki işler için sıkılaştırılmış kovalar (1 ms → 5 sn). */
const FAST_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;

/** Tile üretim/servis süresi. `source` etiketi cache isabetini ayırır. */
export const tileRenderSeconds = histogram(
  'network_tile_render_seconds',
  'Vector tile yanıt süresi (saniye) — cache isabetine göre ayrışır',
  FAST_BUCKETS,
);

/** Tile cache isabet/ıska sayacı; hit oranı hedefi %95 (bkz. riskler tablosu). */
export const tileCacheTotal = counter(
  'network_tile_cache_total',
  'Tile isteklerinin önbellek sonucu (hit | miss)',
);

/** Graf gezinme süresi — `kind` etiketi upstream/downstream/impact ayrımını taşır. */
export const graphTraverseSeconds = histogram(
  'network_graph_traverse_seconds',
  'Bellek-içi graf gezinme süresi (saniye)',
  FAST_BUCKETS,
);

/** Bir gezinmede dokunulan düğüm sayısı — süreyi tek başına okumak yanıltıcıdır. */
export const graphTraverseNodes = histogram(
  'network_graph_traverse_nodes',
  'Bir graf gezinmesinde etkilenen eleman sayısı',
  [1, 10, 100, 1_000, 10_000, 100_000, 600_000],
);

/** Poligon (alan) sorgusu süresi — PostGIS tarafı. */
export const areaQuerySeconds = histogram(
  'network_area_query_seconds',
  'Poligon alan sorgusu süresi (saniye)',
  FAST_BUCKETS,
);

/** Enerjilenme yeniden hesabı süresi. */
export const energizationRecomputeSeconds = histogram(
  'network_energization_recompute_seconds',
  'Enerjilenme yeniden hesap süresi (saniye)',
  FAST_BUCKETS,
);

/** Şu an enerjisiz eleman sayısı — Grafana'daki "karanlık bölge" panosunun kaynağı. */
export const deEnergizedComponents = gauge(
  'network_de_energized_components',
  'Şu an enerjisiz şebeke elemanı sayısı',
);

/** Şu an enerjisiz abone sayısı. */
export const deEnergizedCustomers = gauge(
  'network_de_energized_customers',
  'Şu an enerjisiz abone sayısı',
);

/** Enerjisizlik yaratan (aktif) kesinti sayısı — `startedAt <= now()` süzmesinden sonrası. */
export const activeOutages = gauge(
  'network_active_outages',
  'Enerjisizlik yaratan aktif kesinti sayısı',
);

/**
 * Başlangıcı gelecekte olduğu için henüz enerjisizlik yaratmayan planlı kesinti sayısı.
 * Zamanlayıcı ölürse bu değer düşmeyi bırakır; panoya bu yüzden kondu.
 */
export const scheduledOutages = gauge(
  'network_scheduled_outages',
  'Başlangıcı bekleyen (gelecek tarihli) planlı kesinti sayısı',
);
