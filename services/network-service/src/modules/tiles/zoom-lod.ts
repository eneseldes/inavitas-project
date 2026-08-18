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
  /**
   * TM/DM/trafo "bina izi" (poligon + fider kesicileri + bina içi yol) bu zoom'da üretilir mi.
   * Kaynak veride kesici, bara ve fider birimle **birebir aynı koordinatta** durur; bina izi
   * bunları duvara yayıp birbirinden ayırt edilebilir kılan tek görünümdür.
   */
  includeBuildings: boolean;
}

/** Bina izinin açıldığı zoom — ankara-yeni-detayli-v3.html'deki `BLD_ZOOM` ile aynı. */
export const BUILDING_ZOOM = 16;

/**
 * Zoom tablosu (kümülatif — her satır bir öncekinin üstüne eklenir):
 * 0–7 il · 8–9 +ilçe +seviye 0–6 (TM/DM ve zinciri — 2.125 eleman, seyrek, erken görünmeli)
 * 12 +mahalle +seviye 7–9 (trafo ve zinciri) · 15 +seviye 10–11 (AG hat/buat)
 * 17+ +seviye 12–13 +abone (kofra/ev ölçeği — 230.000'lik en kalabalık katman)
 *
 * TM (44) ve DM (487) sayıca azdır; eskiden DM'nin zoom 14'e kadar hiç görünmemesi
 * ("neden kayboluyor" şikayeti) buradan kaynaklanıyordu — artık TM'yle aynı eşikte (z8).
 */
export function resolveZoomLod(zoom: number): ZoomLod {
  const unitLevels: UnitLevel[] = ['PROVINCE'];
  if (zoom >= 8) unitLevels.push('DISTRICT');
  if (zoom >= 12) unitLevels.push('NEIGHBORHOOD');

  let maxTopologyLevel = -1;
  if (zoom >= 17) maxTopologyLevel = 13;
  else if (zoom >= 15) maxTopologyLevel = 11;
  else if (zoom >= 12) maxTopologyLevel = 9;
  else if (zoom >= 8) maxTopologyLevel = 6;

  return {
    unitLevels,
    maxTopologyLevel,
    includeCustomers: zoom >= 17,
    includeBuildings: zoom >= BUILDING_ZOOM,
  };
}
