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
  loadBreak: boolean;
  normallyOpen: boolean;
  isClosed: boolean;
  status: string | null;
  isEnergized: boolean;
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

export interface DownstreamImpact {
  direction: 'down';
  componentId: string;
  affectedElementIds: string[];
  affectedElementCount: number;
  affectedCustomerCount: number;
  overflowed: boolean;
  radialityViolated: boolean;
  bbox: Bbox | null;
}

export interface UpstreamChain {
  direction: 'up';
  componentId: string;
  chain: { id: string; type: ComponentType; topologyLevel: number; name: string | null }[];
  bbox: Bbox | null;
}

export interface ImpactPreview {
  componentId: string;
  topologyLevel: number;
  highImpact: boolean;
  affectedElementCount: number;
  affectedCustomerCount: number;
  overflowed: boolean;
  radialityViolated: boolean;
}
