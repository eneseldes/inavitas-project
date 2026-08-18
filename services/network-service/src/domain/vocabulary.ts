/**
 * Şebeke veri sözlüğü — `harita-verileri` seed'inde sabitlenmiş enum değerleri.
 */

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

export const COMPONENT_CATEGORIES = [
  'SUBSTATION',
  'MV_NETWORK',
  'DIST_TRANSFORMER',
  'LV_NETWORK',
  'SERVICE_ENTRY',
] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export const BREAKER_ROLES = ['TM_FEEDER', 'DM_ENTRY', 'TRANSFORMER', 'TIE', 'SERVICE_ENTRY'] as const;
export type BreakerRole = (typeof BREAKER_ROLES)[number];

export const VOLTAGE_LEVELS = ['HV', 'MV', 'LV', 'MV_LV'] as const;
export type VoltageLevel = (typeof VOLTAGE_LEVELS)[number];

/** Yüksek etkili kesinti eşiği: bu seviye ve altı TM / bara / fider kesicisi / fider demektir. */
export const HIGH_IMPACT_TOPOLOGY_LEVEL = 3;
