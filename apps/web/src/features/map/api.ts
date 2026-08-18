import { apiFetch } from '../../shared/api/client.ts';
import type { NetworkComponentDetail } from '../../types/network.ts';

/**
 * Tile MVT şemasının sürümü. Tile yanıtları `max-age=3600` ile önbelleğe alındığından,
 * sunucudaki katman/kolon şeması değiştiğinde bu sayı artırılmalıdır — aksi halde
 * istemciler bir saat boyunca eski şemalı tile'ları çizmeye devam eder.
 *
 * 2 — `building_shapes` / `building_inner` / `building_breakers` katmanları ve `band` kolonu.
 */
const TILE_SCHEMA_VERSION = 2;

/** MapLibre'nin doğrudan `vector` kaynağı olarak kullanacağı MVT şablonu — aynı origin, gateway proxy'sinden geçer. */
export const NETWORK_TILE_URL_TEMPLATE = `/api/network/tiles/{z}/{x}/{y}.mvt?v=${TILE_SCHEMA_VERSION}`;

export function fetchComponent(id: string): Promise<NetworkComponentDetail> {
  return apiFetch(`/api/network/components/${id}`);
}
