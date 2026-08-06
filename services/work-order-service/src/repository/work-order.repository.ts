import type { PaginationQuery, SortOrder } from '@edas/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import { db } from '../db.ts';
import { workOrders } from '../db/schema.ts';
import type { WorkOrderStatus } from '../domain/state-machine.ts';

/** Drizzle'ı yalnızca bu katman bilir; controller/service düz nesnelerle çalışır. */
export type WorkOrderRow = typeof workOrders.$inferSelect;
export type WorkOrderType = WorkOrderRow['type'];

export interface WorkOrderFilters {
  status?: WorkOrderStatus[];
  type?: WorkOrderType;
  gisId?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date; // exclusive üst sınır
  hasOutage?: boolean;
}

export interface CreateWorkOrderInput {
  gisId: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  origin: 'USER' | 'SYSTEM';
  createdBy: string;
  outageId?: string | null;
}

/** GET /work-orders sıralama alanları için izin listesi. */
export const SORTABLE_FIELDS = ['createdAt', 'status', 'type', 'gisId'] as const;

// bkz. outage-service/src/repository/outage.repository.ts için aynı gerekçe
// (Record ortak kolon tipine zorlar, düz obje zorlamaz).
const SORT_COLUMNS = {
  createdAt: workOrders.createdAt,
  status: workOrders.status,
  type: workOrders.type,
  gisId: workOrders.gisId,
} as const;

function buildConditions(filters: WorkOrderFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.status && filters.status.length > 0) {
    conditions.push(
      filters.status.length === 1
        ? eq(workOrders.status, filters.status[0]!)
        : inArray(workOrders.status, filters.status),
    );
  }
  if (filters.type) conditions.push(eq(workOrders.type, filters.type));
  // Önek eşleşmesi ('a%') — bkz. outage-service/src/repository/outage.repository.ts için aynı gerekçe.
  if (filters.gisId) conditions.push(ilike(workOrders.gisId, `${filters.gisId}%`));
  if (filters.createdAtFrom) conditions.push(gte(workOrders.createdAt, filters.createdAtFrom));
  if (filters.createdAtTo) conditions.push(lt(workOrders.createdAt, filters.createdAtTo));
  if (filters.hasOutage === true) conditions.push(isNotNull(workOrders.outageId));
  if (filters.hasOutage === false) conditions.push(isNull(workOrders.outageId));

  return conditions;
}

export async function create(input: CreateWorkOrderInput): Promise<WorkOrderRow> {
  const [row] = await db.insert(workOrders).values(input).returning();
  return row!;
}

export async function findById(id: string): Promise<WorkOrderRow | null> {
  const [row] = await db.select().from(workOrders).where(eq(workOrders.id, id));
  return row ?? null;
}

export async function list(
  filters: WorkOrderFilters,
  pagination: PaginationQuery,
  sort: SortOrder,
): Promise<{ items: WorkOrderRow[]; total: number }> {
  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const column = SORT_COLUMNS[sort.field as (typeof SORTABLE_FIELDS)[number]] ?? workOrders.createdAt;
  const orderBy = sort.dir === 'asc' ? asc(column) : desc(column);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, totalRows] = await Promise.all([
    db.select().from(workOrders).where(where).orderBy(orderBy).limit(pagination.pageSize).offset(offset),
    db.select({ value: count() }).from(workOrders).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/** Optimistic locking — bkz. outage-service/src/repository/outage.repository.ts için aynı gerekçe. */
export async function updateWithVersion(
  id: string,
  expectedVersion: number,
  patch: { status?: WorkOrderStatus; outageId?: string | null },
): Promise<WorkOrderRow | null> {
  const [row] = await db
    .update(workOrders)
    .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(workOrders.id, id), eq(workOrders.version, expectedVersion)))
    .returning();

  return row ?? null;
}
