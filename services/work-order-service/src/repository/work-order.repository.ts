import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { db, type Tx } from '../db.ts';
import { workOrders, workOrderStatusHistory } from '../db/schema.ts';
import type { WorkOrderStatus } from '../domain/state-machine.ts';

export type WorkOrderRow = typeof workOrders.$inferSelect;
export type WorkOrderStatusHistoryRow = typeof workOrderStatusHistory.$inferSelect;
export type WorkOrderType = WorkOrderRow['type'];

export interface WorkOrderFilters {
  status?: WorkOrderStatus[];
  type?: WorkOrderType;
  gisId?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
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

export interface StatusChangeMeta {
  fromStatus: WorkOrderStatus;
  actor: string;
  origin: 'USER' | 'SYSTEM';
  correlationId?: string;
}

/** Sıralama yapılabilecek alanlar. */
export const SORTABLE_FIELDS = ['createdAt', 'status', 'type', 'gisId'] as const;

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
  if (filters.gisId) conditions.push(ilike(workOrders.gisId, `${filters.gisId}%`));
  if (filters.createdAtFrom) conditions.push(gte(workOrders.createdAt, filters.createdAtFrom));
  if (filters.createdAtTo) conditions.push(lt(workOrders.createdAt, filters.createdAtTo));
  if (filters.hasOutage === true) conditions.push(isNotNull(workOrders.outageId));
  if (filters.hasOutage === false) conditions.push(isNull(workOrders.outageId));

  return conditions;
}

/** Transaction içinde yeni iş emri kaydı ve durum geçmişi oluşturur. */
export async function createTx(tx: Tx, input: CreateWorkOrderInput, correlationId?: string): Promise<WorkOrderRow> {
  const [row] = await tx.insert(workOrders).values(input).returning();
  await tx.insert(workOrderStatusHistory).values({
    workOrderId: row!.id,
    fromStatus: null,
    toStatus: row!.status,
    actor: input.createdBy,
    origin: input.origin,
    correlationId,
  });
  return row!;
}

/** İş emri ID ile kayıt arar. */
export async function findById(id: string): Promise<WorkOrderRow | null> {
  const [row] = await db.select().from(workOrders).where(eq(workOrders.id, id));
  return row ?? null;
}

/** İş emirlerini filtreler, sıralar ve sayfalanmış olarak listeler. */
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

/** Transaction içinde optimistic locking kontrolü ile iş emrini ve durum geçmişini günceller. */
export async function updateWithVersionTx(
  tx: Tx,
  id: string,
  expectedVersion: number,
  patch: { status?: WorkOrderStatus; outageId?: string | null },
  meta: StatusChangeMeta,
): Promise<WorkOrderRow | null> {
  const [row] = await tx
    .update(workOrders)
    .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(workOrders.id, id), eq(workOrders.version, expectedVersion)))
    .returning();

  if (!row) return null;

  if (patch.status && patch.status !== meta.fromStatus) {
    await tx.insert(workOrderStatusHistory).values({
      workOrderId: id,
      fromStatus: meta.fromStatus,
      toStatus: patch.status,
      actor: meta.actor,
      origin: meta.origin,
      correlationId: meta.correlationId,
    });
  }

  return row;
}

/** İş emrine kesinti bağlantısı atar (outageId günceller). */
export async function linkOutageTx(tx: Tx, workOrderId: string, outageId: string): Promise<WorkOrderRow | null> {
  const [row] = await tx
    .update(workOrders)
    .set({ outageId, version: sql`${workOrders.version} + 1`, updatedAt: new Date() })
    .where(eq(workOrders.id, workOrderId))
    .returning();

  return row ?? null;
}

/** İş emrinin durum değişiklik geçmişini getirir. */
export async function getHistory(workOrderId: string): Promise<WorkOrderStatusHistoryRow[]> {
  return db
    .select()
    .from(workOrderStatusHistory)
    .where(eq(workOrderStatusHistory.workOrderId, workOrderId))
    .orderBy(desc(workOrderStatusHistory.changedAt));
}

