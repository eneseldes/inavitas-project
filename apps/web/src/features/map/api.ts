import type { Polygon } from 'geojson';
import { apiFetch } from '../../shared/api/client.ts';
import type { PageResult } from '../../types/api.ts';
import type {
  Bbox,
  ComponentCategory,
  DownstreamImpact,
  EnergizationSnapshot,
  ImpactPreview,
  NetworkComponentAreaItem,
  NetworkComponentDetail,
  UpstreamChain,
  VoltageLevel,
} from '../../types/network.ts';

/**
 * Tile MVT şemasının sürümü. Tile yanıtları `max-age=3600` ile önbelleğe alındığından,
 * sunucudaki katman/kolon şeması değiştiğinde bu sayı artırılmalıdır — aksi halde
 * istemciler bir saat boyunca eski şemalı tile'ları çizmeye devam eder.
 *
 * 2 — `building_shapes` / `building_inner` / `building_breakers` katmanları ve `band` kolonu.
 * 3 — tip bazlı zoom LOD, `customers` katmanı kaldırıldı, kofra bina izi, duvarda kesilen
 *     hatlar, bina izi sekizgene çevrildi.
 * 4 — TM'de fider sayısı kadar köşe, diğerlerinde kare; kesici köşe yolunun ortasında;
 *     bağlı hattın ucu köşeye taşınıyor; geometri 1e-6 ızgaraya oturtuldu.
 * 5 — köşeler eşit aralıkla değil, hattın geldiği yöne kümelenerek yerleştiriliyor.
 * 6 — düzgün çokgen (TM 8 · DM 5 · trafo 4 · kofra 3), kısa yelpaze, kare sınırında
 *     kopmayan hat çapası.
 * 7 — kofranın yönü ebeveyni olan buattan türetiliyor (irtibat hattı kardeşi, ebeveyni değil).
 * 8 — il/ilçe dolgu bandı artık komşuluk grafiğine göre önceden boyanmış `color_band`
 *     kolonundan geliyor (`hashtext(path) % 8` yerine) — iki komşu ilçe artık aynı renk olamaz.
 * 9 — ilçe verisi z8 değil z7'den itibaren gönderiliyor (bkz. zoom-lod.ts) — il↔ilçe
 *     bindirmeli solması (z7,5-8,5) z7 tile'ında geometri bulabilsin diye.
 */
const TILE_SCHEMA_VERSION = 9;

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

/** Tek birimi yolu ile getirir — `/map?unit=<path>` derin bağı kamerayı buradan kurar. */
export function fetchUnit(path: string): Promise<UnitLabel> {
  return apiFetch(`/api/network/units/${path}`);
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

/** İz yönü — aşağı akış "kimler etkilenir", yukarı akış "nereden besleniyor". */
export type TraceDirection = 'up' | 'down';

/**
 * Tıklanan elemanın izi. Yanıt eleman kimliklerinin yanında bir `bbox` de taşır: harita
 * odağı (`fitBounds`) için istemci binlerce elemanın koordinatını toplamaz, sunucu tek
 * `ST_Extent` sorgusuyla kapsayan dikdörtgeni hesaplayıp döner.
 */
export function fetchTrace(id: string, direction: 'down'): Promise<DownstreamImpact>;
export function fetchTrace(id: string, direction: 'up'): Promise<UpstreamChain>;
export function fetchTrace(id: string, direction: TraceDirection): Promise<DownstreamImpact | UpstreamChain>;
export function fetchTrace(id: string, direction: TraceDirection): Promise<DownstreamImpact | UpstreamChain> {
  return apiFetch(`/api/network/components/${id}/trace?direction=${direction}`);
}

/** Kesinti/iş emri açmadan önceki zorunlu onay adımının beslediği etki özeti. */
export function fetchImpactPreview(id: string): Promise<ImpactPreview> {
  return apiFetch(`/api/network/components/${id}/impact-preview`);
}

/**
 * Görünüm penceresindeki enerjisiz elemanlar.
 *
 * Sorgu **bbox kapsamlıdır**: `setFeatureState` yalnız yüklü tile'lara yazılabilir, ekranda
 * olmayan bir elemanın durumunu taşımanın faydası yok, maliyeti var.
 */
export function fetchEnergization(bbox: Bbox, zoom: number): Promise<EnergizationSnapshot> {
  return apiFetch(`/api/network/energization?bbox=${bbox.join(',')}&zoom=${zoom}`);
}

/** Alan sorgusunun gövdesi — poligon + `/components` ile aynı sözlükten gelen filtreler. */
export interface AreaQueryBody {
  polygon: Polygon;
  category?: ComponentCategory[];
  voltageLevel?: VoltageLevel[];
  page: number;
  pageSize: number;
}

/** Alan sorgusunun yanıtı; `overflowed` sonucun sunucudaki üst sınıra dayandığını söyler. */
export interface AreaQueryResult extends PageResult<NetworkComponentAreaItem> {
  overflowed: boolean;
}

/**
 * Haritada çizilen alanın içindeki şebeke elemanları.
 *
 * **POST**, çünkü poligon gövdede taşınır: bir mahalleyi saran poligon kolayca birkaç
 * kilobayt tutar ve query string sınırına takılır.
 */
export function queryWithin(body: AreaQueryBody): Promise<AreaQueryResult> {
  return apiFetch('/api/network/query/within', { method: 'POST', body });
}
