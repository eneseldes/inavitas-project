import { DARK, LIGHT, layers as protomapsLayers } from '@protomaps/basemaps';
import { addProtocol, type LayerSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

/**
 * Altlık harita — Planetiler ile üretilmiş, tamamen self-host `.pmtiles`.
 * `apps/web/public/basemap/` altına konur, Vite build'i statik olarak `dist`'e kopyalar;
 * ayrı bir container/CDN gerekmez. Dosya geliştiricide yoksa `isBasemapAvailable` false döner
 * ve harita yalnız kendi şebeke katmanlarıyla, düz bir zeminle açılır.
 */
export const BASEMAP_SOURCE_ID = 'basemap';
export const BASEMAP_PMTILES_URL = '/basemap/turkey-basemap.pmtiles';

let protocolRegistered = false;

/** `pmtiles://` protokolünü MapLibre'ye bir kez kaydeder — idempotent. */
export function registerPmtilesProtocol(): void {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}

/**
 * Dosya gerçekten sunucudan geliyor mu — `res.ok` tek başına yetmez: Vite dev sunucusu (ve
 * SPA fallback'i olan her statik sunucu) eşleşmeyen bir yolu 200 ile `index.html`'e düşürür.
 * `text/html` dönen bir yanıt her zaman bu fallback'tir, gerçek `.pmtiles` değildir.
 */
export async function isBasemapAvailable(): Promise<boolean> {
  try {
    const res = await fetch(BASEMAP_PMTILES_URL, { method: 'HEAD' });
    if (!res.ok) return false;
    return !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

/** Protomaps'in resmi açık/koyu paleti — kendi `--c-map-*` katmanlarımızdan bağımsız, üzerine boyanmaz. */
export function buildBasemapLayers(theme: 'light' | 'dark'): LayerSpecification[] {
  return protomapsLayers(BASEMAP_SOURCE_ID, theme === 'dark' ? DARK : LIGHT, { lang: 'tr' });
}

