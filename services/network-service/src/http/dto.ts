import type { DownstreamImpact, ImpactPreview } from '../modules/impact/service.ts';
import type { Bbox, ComponentAreaRow, ComponentRow } from '../repository/components.repository.ts';
import type { CustomerPiiRow, CustomerRow } from '../repository/customers.repository.ts';
import type { UnitRow } from '../repository/units.repository.ts';

/** İdari birim veritabanı kaydını API DTO nesnesine dönüştürür. */
export function toUnitDto(row: UnitRow) {
  return {
    path: row.path,
    parentPath: row.parentPath,
    level: row.level,
    name: row.name,
    provinceName: row.provinceName,
    districtName: row.districtName,
    externalRef: row.externalRef,
    centerLat: row.centerLat,
    centerLon: row.centerLon,
    hamlets: row.hamlets,
  };
}

/** Şebeke elemanı veritabanı kaydını API DTO nesnesine dönüştürür. */
export function toComponentDto(row: ComponentRow) {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    breakerRole: row.breakerRole,
    voltageLevel: row.voltageLevel,
    topologyLevel: row.topologyLevel,
    parentId: row.parentId,
    tmId: row.tmId,
    feederId: row.feederId,
    dmId: row.dmId,
    transformerId: row.transformerId,
    unitPath: row.unitPath,
    unitPaths: row.unitPaths,
    unitPathSource: row.unitPathSource,
    lat: row.lat,
    lon: row.lon,
    switchable: row.switchable,
    loadBreak: row.loadBreak,
    normallyOpen: row.normallyOpen,
    isClosed: row.isClosed,
    status: row.status,
    isEnergized: row.isEnergized,
    name: row.name,
    attributes: row.attributes,
  };
}

/** Alan sorgusu satırı — liste mahalle ve ilçe adını gösterir, ltree kodunu değil. */
export function toComponentAreaDto(row: ComponentAreaRow) {
  return { ...toComponentDto(row), unitName: row.unitName, districtName: row.districtName };
}

/** Eleman detayını idari ata zinciriyle (il → ilçe → mahalle) birlikte döner. */
export function toComponentDetailDto(row: ComponentRow, unitAncestors: UnitRow[]) {
  return {
    ...toComponentDto(row),
    unitAncestors: unitAncestors.map((u) => ({ path: u.path, level: u.level, name: u.name })),
  };
}

/** Aşağı akış (downstream) izini/etkisini API DTO nesnesine dönüştürür. */
export function toDownstreamImpactDto(impact: DownstreamImpact) {
  return {
    componentId: impact.componentId,
    affectedElementIds: impact.affectedElementIds,
    affectedElementCount: impact.affectedElementCount,
    affectedCustomerCount: impact.affectedCustomerCount,
    overflowed: impact.overflowed,
    radialityViolated: impact.radialityViolated,
  };
}

/** Yukarı akış (upstream) besleme zincirini API DTO nesnesine dönüştürür. */
export function toUpstreamChainDto(componentId: string, chain: ComponentRow[]) {
  return {
    componentId,
    chain: chain.map((c) => ({ id: c.id, type: c.type, topologyLevel: c.topologyLevel, name: c.name })),
  };
}

/**
 * Kapsayan dikdörtgeni `[minLon, minLat, maxLon, maxLat]` biçiminde döner (GeoJSON `bbox`
 * kuralı) — istemci tarafında `fitBounds` çağrısına doğrudan geçirilebilir bir ham dizi.
 */
export function toBboxDto(bbox: Bbox | null): [number, number, number, number] | null {
  if (!bbox) return null;
  return [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat];
}

/** Etki önizlemesini (kesinti onay adımı) API DTO nesnesine dönüştürür. */
export function toImpactPreviewDto(preview: ImpactPreview) {
  return {
    componentId: preview.componentId,
    topologyLevel: preview.topologyLevel,
    highImpact: preview.highImpact,
    affectedElementCount: preview.affectedElementCount,
    affectedCustomerCount: preview.affectedCustomerCount,
    overflowed: preview.overflowed,
    radialityViolated: preview.radialityViolated,
  };
}

/** Abone veritabanı kaydını API DTO nesnesine dönüştürür (PII hariç). */
export function toCustomerDto(row: CustomerRow) {
  return {
    id: row.id,
    parentId: row.parentId,
    tmId: row.tmId,
    feederId: row.feederId,
    dmId: row.dmId,
    transformerId: row.transformerId,
    unitPath: row.unitPath,
    unitPathSource: row.unitPathSource,
    lat: row.lat,
    lon: row.lon,
    customerType: row.customerType,
    voltage: row.voltage,
    phase: row.phase,
    contractedPowerKw: row.contractedPowerKw,
    estimatedPeakKw: row.estimatedPeakKw,
    status: row.status,
  };
}

/** Abone PII veritabanı kaydını API DTO nesnesine dönüştürür. */
export function toCustomerPiiDto(row: CustomerPiiRow) {
  return {
    id: row.id,
    wiringId: row.wiringId,
    contractId: row.contractId,
  };
}
