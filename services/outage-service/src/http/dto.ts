import { computeCustomerMinutes } from '../domain/cascade.ts';
import { computeDurationMinutes } from '../domain/rules.ts';
import type {
  OutageAffectedCustomerRow,
  OutageImpactRow,
  OutageMapRow,
  OutageRelationRow,
  OutageRow,
  OutageStatusHistoryRow,
} from '../repository/outage.repository.ts';

/** Kesinti veritabanı kaydını API DTO nesnesine dönüştürür. */
export function toOutageDto(row: OutageRow) {
  const durationMinutes = computeDurationMinutes(row.startedAt, row.endedAt);

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationMinutes,
    status: row.status,
    kind: row.kind,
    workOrderId: row.workOrderId,
    cbsId: row.cbsId,
    unitPath: row.unitPath,
    componentType: row.componentType,
    componentName: row.componentName,
    topologyLevel: row.topologyLevel,
    affectedCustomerCount: row.affectedCustomerCount,
    impactStatus: row.impactStatus,
    parentOutageId: row.parentOutageId,
    /** Kapsanan kesintide 0'dır — aynı abone iki kez sayılmaz (bkz. domain/cascade.ts). */
    customerMinutes: computeCustomerMinutes(row.affectedCustomerCount, durationMinutes, row.parentOutageId),
    origin: row.origin,
    createdBy: row.createdBy,
    version: row.version,
  };
}

/** Kesinti geçmişi veritabanı kaydını API DTO nesnesine dönüştürür. */
export function toOutageHistoryDto(row: OutageStatusHistoryRow) {
  return {
    id: row.id,
    changedAt: row.changedAt.toISOString(),
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actor: row.actor,
    origin: row.origin,
  };
}

/** Etki anlık görüntüsünü API DTO nesnesine dönüştürür. */
export function toOutageImpactDto(row: OutageImpactRow) {
  return {
    outageId: row.outageId,
    revision: row.revision,
    affectedElementIds: row.affectedElementIds,
    affectedElementCount: row.affectedElementCount,
    affectedCustomerCount: row.affectedCustomerCount,
    overflowed: row.overflowed,
    radialityViolated: row.radialityViolated,
    calculatedAt: row.calculatedAt.toISOString(),
  };
}

/** Etkilenen abone satırını API DTO nesnesine dönüştürür (PII yoktur). */
export function toAffectedCustomerDto(row: OutageAffectedCustomerRow) {
  return {
    customerId: row.customerId,
    unitPath: row.unitPath,
    customerType: row.customerType,
  };
}

/** Kaskad ilişkisini API DTO nesnesine dönüştürür. */
export function toOutageRelationDto(row: OutageRelationRow) {
  return {
    parentOutageId: row.parentOutageId,
    childOutageId: row.childOutageId,
    relationType: row.relationType,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Harita katmanı özeti — çizim için gereken en küçük alan kümesi. Kesinti listesinin
 * DTO'su kullanılmaz: harita binlerce kayıt çeker, her satırda taşınmayan her alan bayt
 * tasarrufudur.
 */
export function toOutageMapDto(row: OutageMapRow) {
  return {
    id: row.id,
    cbsId: row.cbsId,
    status: row.status,
    kind: row.kind,
    componentType: row.componentType,
    breakerRole: row.breakerRole,
    unitPath: row.unitPath,
    unitName: row.unitName,
    districtName: row.districtName,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    affectedCustomerCount: row.affectedCustomerCount,
    /** Kapsanan kesinti — haritada üstteki kesintinin altında soluk çizilir. */
    parentOutageId: row.parentOutageId,
    workOrderId: row.workOrderId,
    lat: row.lat,
    lon: row.lon,
  };
}
