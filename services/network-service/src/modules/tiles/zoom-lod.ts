/**
 * Zoom → katman (LOD — level of detail) eşlemesi. Saf fonksiyon, I/O yoktur.
 */

import type { UnitLevel } from '../../domain/vocabulary.ts';

export interface ZoomLod {
  /** Bu zoom'da görünmesi gereken idari birim seviyeleri (kümülatif). */
  unitLevels: UnitLevel[];
  /** Bu zoom'da görünmesi gereken en yüksek şebeke `topology_level` değeri; -1 → hiç eleman yok. */
  maxTopologyLevel: number;
  /** Abone (customer) katmanı bu zoom'da açık mı. */
  includeCustomers: boolean;
}

/**
 * Zoom tablosu (kümülatif — her satır bir öncekinin üstüne eklenir):
 * 0–7 il · 8–9 +ilçe · 10–11 +seviye 0 · 12 +mahalle +seviye 1–3 · 13 +seviye 4
 * 14 +seviye 5–6 · 15 +seviye 7–9 · 16 +seviye 10–11 · 17+ +seviye 12–13 +abone
 */
export function resolveZoomLod(zoom: number): ZoomLod {
  const unitLevels: UnitLevel[] = ['PROVINCE'];
  if (zoom >= 8) unitLevels.push('DISTRICT');
  if (zoom >= 12) unitLevels.push('NEIGHBORHOOD');

  let maxTopologyLevel = -1;
  if (zoom >= 17) maxTopologyLevel = 13;
  else if (zoom >= 16) maxTopologyLevel = 11;
  else if (zoom >= 15) maxTopologyLevel = 9;
  else if (zoom >= 14) maxTopologyLevel = 6;
  else if (zoom >= 13) maxTopologyLevel = 4;
  else if (zoom >= 12) maxTopologyLevel = 3;
  else if (zoom >= 10) maxTopologyLevel = 0;

  return { unitLevels, maxTopologyLevel, includeCustomers: zoom >= 17 };
}
