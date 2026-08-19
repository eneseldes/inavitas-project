import type {
  WorkOrderMapRow,
  WorkOrderRow,
  WorkOrderStatusHistoryRow,
} from '../repository/work-order.repository.ts';

/** İş emri veritabanı kaydını API DTO nesnesine dönüştürür. */
export function toWorkOrderDto(row: WorkOrderRow) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status,
    type: row.type,
    cbsId: row.cbsId,
    unitPath: row.unitPath,
    unitName: row.unitName,
    outageId: row.outageId,
    origin: row.origin,
    createdBy: row.createdBy,
    version: row.version,
  };
}

/** İş emri geçmişi veritabanı kaydını API DTO nesnesine dönüştürür. */
export function toWorkOrderHistoryDto(row: WorkOrderStatusHistoryRow) {
  return {
    id: row.id,
    changedAt: row.changedAt.toISOString(),
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actor: row.actor,
    origin: row.origin,
  };
}


/**
 * Harita katmanı özeti — çizim için gereken en küçük alan kümesi. Harita binlerce kayıt
 * çeker; taşınmayan her alan bayt tasarrufudur.
 */
export function toWorkOrderMapDto(row: WorkOrderMapRow) {
  return {
    id: row.id,
    cbsId: row.cbsId,
    status: row.status,
    type: row.type,
    componentType: row.componentType,
    breakerRole: row.breakerRole,
    unitPath: row.unitPath,
    unitName: row.unitName,
    createdAt: row.createdAt.toISOString(),
    outageId: row.outageId,
    lat: row.lat,
    lon: row.lon,
  };
}
