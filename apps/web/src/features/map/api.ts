import { apiFetch } from '../../shared/api/client.ts';
import type { NetworkComponentDetail } from '../../types/network.ts';

/**
 * Tile MVT şemasının sürümü. Tile yanıtları `max-age=3600` ile önbelleğe alındığından,
 * sunucudaki katman/kolon şeması değiştiğinde bu sayı artırılmalıdır — aksi halde
 * istemciler bir saat boyunca eski şemalı tile'ları çizmeye devam eder.
 *
 * 2 — `building_shapes` / `building_inner` / `building_breakers` katmanları ve `band` kolonu.
 * 3 — tip bazlı zoom LOD, `customers` katmanı kaldırıldı, kofra bina izi, duvarda kesilen
 *     hatlar, v3 `ringLL` ile aynı sekizgen.
 * 4 — TM'de fider sayısı kadar köşe, diğerlerinde kare; kesici köşe yolunun ortasında;
 *     bağlı hattın ucu köşeye taşınıyor; geometri 1e-6 ızgaraya oturtuldu.
 * 5 — köşeler eşit aralıkla değil, hattın geldiği yöne kümelenerek yerleştiriliyor.
 * 6 — düzgün çokgen (TM 8 · DM 5 · trafo 4 · kofra 3), kısa yelpaze, kare sınırında
 *     kopmayan hat çapası.
 * 7 — kofranın yönü ebeveyni olan buattan türetiliyor (irtibat hattı kardeşi, ebeveyni değil).
 */
const TILE_SCHEMA_VERSION = 7;

/** MapLibre'nin doğrudan `vector` kaynağı olarak kullanacağı MVT şablonu — aynı origin, gateway proxy'sinden geçer. */
export const NETWORK_TILE_URL_TEMPLATE = `/api/network/tiles/{z}/{x}/{y}.mvt?v=${TILE_SCHEMA_VERSION}`;

export function fetchComponent(id: string): Promise<NetworkComponentDetail> {
  return apiFetch(`/api/network/components/${id}`);
}

export interface UnitLabel {
  path: string;
  level: 'PROVINCE' | 'DISTRICT' | 'NEIGHBORHOOD';
  name: string;
  centerLat: number | null;
  centerLon: number | null;
}

/**
 * İl/ilçe adlarını haritaya yazmak için merkez noktalarını getirir. Sayfa boyutu sunucuda
 * 100 ile sınırlı (MAX_PAGE_SIZE); bugün Ankara'da 1 il + 25 ilçe var ama veri seti
 * genişlerse sessizce kırpılmasın diye sayfalar dolaşılır.
 */
export async function fetchUnitLabels(level: 'PROVINCE' | 'DISTRICT'): Promise<UnitLabel[]> {
  const pageSize = 100;
  const all: UnitLabel[] = [];
  for (let page = 1; ; page++) {
    const res = await apiFetch<{ items: UnitLabel[]; totalPages: number }>(
      `/api/network/units?level=${level}&pageSize=${pageSize}&page=${page}`,
    );
    all.push(...res.items);
    if (page >= res.totalPages) break;
  }
  return all.filter((u) => u.centerLat !== null && u.centerLon !== null);
}
