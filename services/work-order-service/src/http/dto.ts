import type { WorkOrderRow } from '../repository/work-order.repository.ts';

/** DB satırını API response şekline çevirir. */
export function toWorkOrderDto(row: WorkOrderRow) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status,
    type: row.type,
    gisId: row.gisId,
    outageId: row.outageId,
    origin: row.origin,
    createdBy: row.createdBy,
    version: row.version,
  };
}
