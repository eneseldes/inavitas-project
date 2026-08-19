/**
 * Zoom → katman (LOD — level of detail) eşlemesi. Saf fonksiyon, I/O yoktur.
 */

import type { UnitLevel } from '../../domain/vocabulary.ts';

export interface ZoomLod {
  /** Bu zoom'da görünmesi gereken idari birim seviyeleri. Boşsa hiç birim gönderilmez. */
  unitLevels: UnitLevel[];
  /** `components` katmanına girecek eleman tipleri. Boşsa hiç eleman yok. */
  componentTypes: string[];
  /** Kofra (SERVICE_ENTRY kesicisi) bu zoom'da tile'a giriyor mu. */
  includeServiceEntry: boolean;
  /**
   * TM/DM/trafo/kofra "bina izi" (poligon + kesiciler + bina içi yol) bu zoom'da üretilir mi.
   * Kaynak veride kesici, bara ve fider birimle **birebir aynı koordinatta** durur; bina izi
   * bunları duvara yayıp birbirinden ayırt edilebilir kılan tek görünümdür.
   */
  includeBuildings: boolean;
}

/** Bina izinin açıldığı zoom — istemcideki `BUILDING_ZOOM` ile aynı olmalıdır. */
export const BUILDING_ZOOM = 16;

/**
 * Eleman tiplerinin görünmeye başladığı zoom eşikleri. Tile'lar tam sayı zoom'da üretildiği
 * için sunucu bunların **tabanına** göre filtreler (ör. 9,75 → 9); kesin eşik istemcide
 * katmanın `minzoom`'uyla uygulanır (bkz. apps/web/src/features/map/networkLayers.ts).
 * İki taraf da bu tablodan türetilmelidir, yoksa "veri var ama çizilmiyor" durumu oluşur.
 */
export const TYPE_MIN_ZOOM: Record<string, number> = {
  TM: 8,
  HV_LINE: 8,
  HV_LINK: 8,
  DM: 9.75,
  MV_LINE: 9.75,
  MV_TIE_LINE: 9.75,
  MV_BRANCH: 12,
  TRANSFORMER: 12,
  LV_JUNCTION: 15,
  LV_LINE: 15,
  SERVICE_DROP: 16.5,
};

/**
 * ⚠️ `BUS`, `FEEDER` ve `LV_BUS` hiçbir zoom'da gönderilmez: kaynak veride sahibi olan
 * birimle tam aynı koordinatta dururlar, çizilirlerse birimin üstünü kapatıp onu
 * tıklanamaz hale getirirler. TM/DM/trafo kesicileri de bu katmana girmez — onlar yalnız
 * bina izi içinde, duvara yayılmış konumlarında çizilir (`building_breakers`).
 */
export function resolveZoomLod(zoom: number): ZoomLod {
  const unitLevels: UnitLevel[] = [];
  // İl/ilçe dolgusu yalnız z≤13'te çizilir; üstünde birim poligonu göndermek boşuna bayt.
  if (zoom <= 13) unitLevels.push('PROVINCE');
  if (zoom >= 8 && zoom <= 13) unitLevels.push('DISTRICT');

  const componentTypes = Object.entries(TYPE_MIN_ZOOM)
    .filter(([, minZoom]) => zoom >= Math.floor(minZoom))
    .map(([type]) => type);

  const includeServiceEntry = zoom >= Math.floor(TYPE_MIN_ZOOM.SERVICE_DROP!);

  return {
    unitLevels,
    componentTypes,
    includeServiceEntry,
    includeBuildings: zoom >= BUILDING_ZOOM,
  };
}
