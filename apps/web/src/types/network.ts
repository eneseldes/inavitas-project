/** Şebeke veri sözlüğü — bkz. services/network-service/src/domain/vocabulary.ts. */
export const UNIT_LEVELS = ['PROVINCE', 'DISTRICT', 'NEIGHBORHOOD'] as const;
export type UnitLevel = (typeof UNIT_LEVELS)[number];

export const COMPONENT_TYPES = [
  'TM',
  'BUS',
  'CIRCUIT_BREAKER',
  'FEEDER',
  'MV_LINE',
  'MV_BRANCH',
  'MV_TIE_LINE',
  'DM',
  'TRANSFORMER',
  'LV_BUS',
  'LV_LINE',
  'LV_JUNCTION',
  'SERVICE_DROP',
  'HV_LINE',
  'HV_LINK',
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const COMPONENT_CATEGORIES = ['SUBSTATION', 'MV_NETWORK', 'DIST_TRANSFORMER', 'LV_NETWORK', 'SERVICE_ENTRY'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export const BREAKER_ROLES = ['TM_FEEDER', 'DM_ENTRY', 'TRANSFORMER', 'TIE', 'SERVICE_ENTRY'] as const;
export type BreakerRole = (typeof BREAKER_ROLES)[number];

export const VOLTAGE_LEVELS = ['HV', 'MV', 'LV', 'MV_LV'] as const;
export type VoltageLevel = (typeof VOLTAGE_LEVELS)[number];

export interface UnitAncestor {
  path: string;
  level: UnitLevel;
  name: string;
}

export interface NetworkComponent {
  id: string;
  type: ComponentType;
  category: ComponentCategory;
  breakerRole: BreakerRole | null;
  voltageLevel: VoltageLevel;
  topologyLevel: number;
  parentId: string | null;
  tmId: string | null;
  feederId: string | null;
  dmId: string | null;
  transformerId: string | null;
  unitPath: string;
  unitPaths: string[];
  unitPathSource: string;
  lat: number | null;
  lon: number | null;
  switchable: boolean;
  status: string | null;
  /**
   * Elemanın **şu anki** enerjilenme durumu. Sunucuda kolondan değil, aktif kesintilerden
   * türetilen bellek-içi hesaptan gelir — `network.components.is_energized` yalnız seed'in
   * başlangıç koşuludur ve runtime'da güncellenmez.
   */
  isEnergized: boolean;
  /** Elemanı karartan kesintinin kimliği; enerjiliyse `null`. */
  deEnergizedBy: string | null;
  name: string | null;
  attributes: Record<string, unknown> | null;
}

export interface NetworkComponentDetail extends NetworkComponent {
  unitAncestors: UnitAncestor[];
}

/** Alan (poligon) sorgusu satırı — listede `unit_path` kodu değil ilçe/mahalle adı gösterilir. */
export interface NetworkComponentAreaItem extends NetworkComponent {
  unitName: string | null;
  districtName: string | null;
}

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

/**
 * Haritanın vurgu kümesine erişimi. Kimlik listesi değil **token** taşınır: harita izi
 * kimliklerden değil, token'ın kendi tile'larından çizer (bkz. features/map/highlightLayers.ts).
 */
export interface HighlightSetRef {
  /** Küme boşsa `null`. */
  setToken: string | null;
  /** Küme sunucudaki üst sınıra dayandı — vurgu eksik olabilir. */
  setTruncated: boolean;
}

/**
 * ⚠️ Kimlik listesi TAŞIMAZ. Vurgu `setToken`'ın tile'larından çizilir, panelde yalnız
 * sayılar görünür — listeyi kimse okumuyordu ve yüz binlerce elemanlı bir izde tarayıcıya
 * megabaytlarca ölü JSON iniyordu. Sunucudaki 10.000'lik kırpma da bu yüzden kalktı
 * (bkz. network-service modules/impact/service.ts).
 */
export interface DownstreamImpact extends HighlightSetRef {
  direction: 'down';
  componentId: string;
  affectedElementCount: number;
  affectedCustomerCount: number;
  radialityViolated: boolean;
  bbox: Bbox | null;
}

export interface UpstreamChain extends HighlightSetRef {
  direction: 'up';
  componentId: string;
  chain: { id: string; type: ComponentType; topologyLevel: number; name: string | null }[];
  bbox: Bbox | null;
}

/** Kaskad onay modalında listelenen alt kesinti özeti. */
export interface ChildOutage {
  outageId: string;
  cbsId: string;
  componentName: string | null;
  componentType: string;
  status: string;
  affectedCustomerCount: number;
}

export interface ImpactPreview {
  componentId: string;
  topologyLevel: number;
  affectedElementCount: number;
  affectedCustomerCount: number;
  radialityViolated: boolean;
  isEnergized: boolean;
  deEnergizedBy: string | null;
  /** Beslediği hatta süren kesintiler — liste `CHILD_OUTAGE_PREVIEW_LIMIT` ile kırpılır. */
  childOutages: ChildOutage[];
  /** Kırpılmamış toplam alt kesinti sayısı. */
  childOutageCount: number;
}

/**
 * Enerjisiz kümenin özeti. **Kimlik listesi taşımaz** — görünüm penceresine göre kırpılmış
 * bir liste, ekrandan çıkan hattın kırmızılığını kaybetmesine sebep oluyordu. Harita kümeyi
 * `setToken`'ın tile'larından çizer; sayılar yalnız panel/uyarı metinleri içindir.
 */
export interface EnergizationSnapshot {
  /** Sunucudaki hesap sürümü — her yeniden hesapta artar; token da bununla değişir. */
  version: number;
  setToken: string | null;
  /** Enerjisiz eleman sayısı (abone hariç). */
  deEnergizedCount: number;
  /**
   * "Açık konuma geçmiş" kesici sayısı. Kesiciler kümede `open` rolüyle durur ve haritada
   * içi boş, kırmızı konturlu çizilir; istemci bunları türetemez, bir TM kesintisi sunucuda
   * N fider kesicisine genişler.
   */
  openSwitchCount: number;
  /** Küme sunucudaki üst sınıra dayandı; vurgu eksik olabilir. */
  truncated: boolean;
}
