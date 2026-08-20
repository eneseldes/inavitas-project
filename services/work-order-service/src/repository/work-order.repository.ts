import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { db, type Tx } from '../db.ts';
import { networkComponentsRo, workOrders, workOrderStatusHistory } from '../db/schema.ts';
import type { WorkOrderStatus } from '../domain/state-machine.ts';

export type WorkOrderRow = typeof workOrders.$inferSelect;
export type WorkOrderStatusHistoryRow = typeof workOrderStatusHistory.$inferSelect;
export type WorkOrderType = WorkOrderRow['type'];

export interface WorkOrderFilters {
  status?: WorkOrderStatus[];
  type?: WorkOrderType[];
  cbsId?: string;
  /** İdari birim alt ağacı — `unit_path <@ :unitPath` (ltree GiST indeksi kullanılır). */
  unitPath?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  origin?: ('USER' | 'SYSTEM')[];
  hasOutage?: boolean;
}

export interface CreateWorkOrderInput {
  cbsId: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  origin: 'USER' | 'SYSTEM';
  createdBy: string;
  outageId?: string | null;
  // Oluşturma anında `network_components_ro`'dan denormalize edilen alanlar.
  unitPath: string;
  unitName: string | null;
}

/** Harita katmanının ihtiyaç duyduğu hafif iş emri özeti. */
export interface WorkOrderMapRow {
  id: string;
  cbsId: string;
  status: WorkOrderStatus;
  type: WorkOrderType;
  /** Bağlı elemanın tipi ve kesici rolü — harita katmanının zoom eşiği bunlardan türer. */
  componentType: string;
  breakerRole: string | null;
  unitPath: string;
  unitName: string | null;
  districtName: string | null;
  createdAt: Date;
  outageId: string | null;
  lat: number;
  lon: number;
}

export interface StatusChangeMeta {
  fromStatus: WorkOrderStatus;
  actor: string;
  origin: 'USER' | 'SYSTEM';
  correlationId?: string;
}

/** Sıralama yapılabilecek alanlar. */
export const SORTABLE_FIELDS = ['createdAt', 'status', 'type', 'cbsId'] as const;

const SORT_COLUMNS = {
  createdAt: workOrders.createdAt,
  status: workOrders.status,
  type: workOrders.type,
  cbsId: workOrders.cbsId,
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
  if (filters.origin && filters.origin.length > 0) {
    conditions.push(
      filters.origin.length === 1
        ? eq(workOrders.origin, filters.origin[0]!)
        : inArray(workOrders.origin, filters.origin),
    );
  }
  if (filters.type && filters.type.length > 0) {
    conditions.push(
      filters.type.length === 1 ? eq(workOrders.type, filters.type[0]!) : inArray(workOrders.type, filters.type),
    );
  }
  if (filters.unitPath) conditions.push(sql`${workOrders.unitPath} <@ ${filters.unitPath}::ltree`);
  if (filters.cbsId) conditions.push(ilike(workOrders.cbsId, `${filters.cbsId}%`));
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

/**
 * Bitmemiş durumlar — bu durumlardaki bir iş emri varken aynı elemana ikincisi açılamaz.
 * `DONE` ve `CANCELLED` kapanmış sayılır.
 */
const ACTIVE_WORK_ORDER_STATUSES = ['STARTED', 'ASSIGNED', 'IN_PROGRESS', 'ENERGIZED'] as const;

/** Elemanın üzerinde süren iş emrini döner (kapı sorgusu). */
export async function findActiveByCbsId(cbsId: string): Promise<WorkOrderRow | null> {
  const [row] = await db
    .select()
    .from(workOrders)
    .where(and(eq(workOrders.cbsId, cbsId), inArray(workOrders.status, [...ACTIVE_WORK_ORDER_STATUSES])))
    .orderBy(desc(workOrders.createdAt))
    .limit(1);

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


/**
 * Harita katmanı için hafif özet. Koordinat `network_components_ro` read-model'inden gelir;
 * iş emri satırında koordinat kopyası tutulmaz.
 */
export async function listForMap(filters: WorkOrderFilters, limit: number): Promise<WorkOrderMapRow[]> {
  const conditions = buildConditions(filters);

  return db
    .select({
      id: workOrders.id,
      cbsId: workOrders.cbsId,
      status: workOrders.status,
      type: workOrders.type,
      componentType: networkComponentsRo.type,
      breakerRole: networkComponentsRo.breakerRole,
      unitPath: workOrders.unitPath,
      unitName: workOrders.unitName,
      districtName: networkComponentsRo.districtName,
      createdAt: workOrders.createdAt,
      outageId: workOrders.outageId,
      lat: networkComponentsRo.lat,
      lon: networkComponentsRo.lon,
    })
    .from(workOrders)
    .innerJoin(networkComponentsRo, eq(networkComponentsRo.id, workOrders.cbsId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(workOrders.createdAt))
    .limit(limit);
}
