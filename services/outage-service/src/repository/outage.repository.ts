import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { db, type Tx } from '../db.ts';
import { outages, outageStatusHistory } from '../db/schema.ts';
import type { OutageStatus } from '../domain/state-machine.ts';

/** Drizzle'ı yalnızca bu katman bilir; controller/service düz nesnelerle çalışır. */
export type OutageRow = typeof outages.$inferSelect;
export type OutageStatusHistoryRow = typeof outageStatusHistory.$inferSelect;

export interface OutageFilters {
  status?: OutageStatus[];
  gisId?: string;
  startedAtFrom?: Date;
  startedAtTo?: Date; // exclusive üst sınır
  createdAtFrom?: Date;
  createdAtTo?: Date; // exclusive üst sınır
  hasWorkOrder?: boolean;
}

export interface CreateOutageInput {
  gisId: string;
  startedAt: Date;
  endedAt: Date | null;
  status: OutageStatus;
  origin: 'USER' | 'SYSTEM';
  createdBy: string;
  workOrderId?: string | null;
}

export interface StatusChangeMeta {
  fromStatus: OutageStatus;
  actor: string;
  origin: 'USER' | 'SYSTEM';
  correlationId?: string;
}

/** GET /outages sıralama alanları için izin listesi — SQL enjeksiyonuna açık serbest string yok. */
export const SORTABLE_FIELDS = ['createdAt', 'startedAt', 'status', 'gisId'] as const;

// Record<...> ile ortak bir kolon tipine zorlamıyoruz: her sütunun kendi
// literal `name` tipi farklı, Record bunu tek bir tipe daraltmaya çalışıp
// derleme hatası veriyor. Düz obje + `keyof` araması aynı SQL enjeksiyon
// korumasını (yalnızca izin verilen alan adları) tip hatası olmadan sağlar.
const SORT_COLUMNS = {
  createdAt: outages.createdAt,
  startedAt: outages.startedAt,
  status: outages.status,
  gisId: outages.gisId,
} as const;

function buildConditions(filters: OutageFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.status && filters.status.length > 0) {
    conditions.push(
      filters.status.length === 1 ? eq(outages.status, filters.status[0]!) : inArray(outages.status, filters.status),
    );
  }
  // Önek eşleşmesi ('a%' — "a ile başlayan"), tam eşleşme DEĞİL. Kullanıcı
  // arama kutusuna kesicinin ID'sinin başını yazıp geri kalanını görmek
  // ister; `eq()` bunu saçma şekilde reddediyordu.
  if (filters.gisId) conditions.push(ilike(outages.gisId, `${filters.gisId}%`));
  if (filters.startedAtFrom) conditions.push(gte(outages.startedAt, filters.startedAtFrom));
  if (filters.startedAtTo) conditions.push(lt(outages.startedAt, filters.startedAtTo));
  if (filters.createdAtFrom) conditions.push(gte(outages.createdAt, filters.createdAtFrom));
  if (filters.createdAtTo) conditions.push(lt(outages.createdAt, filters.createdAtTo));
  if (filters.hasWorkOrder === true) conditions.push(isNotNull(outages.workOrderId));
  if (filters.hasWorkOrder === false) conditions.push(isNull(outages.workOrderId));

  return conditions;
}

/** `create()`in tx-kabul eden çekirdeği — Kafka consumer'ları da bunu kullanır (bkz. kafka/consumers.ts). */
export async function createTx(tx: Tx, input: CreateOutageInput, correlationId?: string): Promise<OutageRow> {
  const [row] = await tx.insert(outages).values(input).returning();
  await tx.insert(outageStatusHistory).values({
    outageId: row!.id,
    fromStatus: null,
    toStatus: row!.status,
    actor: input.createdBy,
    origin: input.origin,
    correlationId,
  });
  return row!;
}

export async function create(input: CreateOutageInput, correlationId?: string): Promise<OutageRow> {
  return db.transaction((tx) => createTx(tx, input, correlationId));
}

export async function findById(id: string): Promise<OutageRow | null> {
  const [row] = await db.select().from(outages).where(eq(outages.id, id));
  return row ?? null;
}

export async function list(
  filters: OutageFilters,
  pagination: PaginationQuery,
  sort: SortOrder,
): Promise<{ items: OutageRow[]; total: number }> {
  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const column = SORT_COLUMNS[sort.field as (typeof SORTABLE_FIELDS)[number]] ?? outages.createdAt;
  const orderBy = sort.dir === 'asc' ? asc(column) : desc(column);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, totalRows] = await Promise.all([
    db.select().from(outages).where(where).orderBy(orderBy).limit(pagination.pageSize).offset(offset),
    db.select({ value: count() }).from(outages).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/**
 * Optimistic locking (roadmap Faz 2, adım 5): yalnızca beklenen `version`
 * eşleşirse günceller, `version`i bir artırır. Etkilenen satır 0 ise
 * çağıran taraf bunu 409 Conflict'e çevirir (version uyuşmazlığı).
 */
/** `updateWithVersion()`in tx-kabul eden çekirdeği — Kafka consumer'ları da bunu kullanır. */
export async function updateWithVersionTx(
  tx: Tx,
  id: string,
  expectedVersion: number,
  patch: { status?: OutageStatus; endedAt?: Date | null; workOrderId?: string | null },
  meta: StatusChangeMeta,
): Promise<OutageRow | null> {
  const [row] = await tx
    .update(outages)
    .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(outages.id, id), eq(outages.version, expectedVersion)))
    .returning();

  if (!row) return null;

  if (patch.status && patch.status !== meta.fromStatus) {
    await tx.insert(outageStatusHistory).values({
      outageId: id,
      fromStatus: meta.fromStatus,
      toStatus: patch.status,
      actor: meta.actor,
      origin: meta.origin,
      correlationId: meta.correlationId,
    });
  }

  return row;
}

export async function updateWithVersion(
  id: string,
  expectedVersion: number,
  patch: { status?: OutageStatus; endedAt?: Date | null; workOrderId?: string | null },
  meta: StatusChangeMeta,
): Promise<OutageRow | null> {
  return db.transaction((tx) => updateWithVersionTx(tx, id, expectedVersion, patch, meta));
}

/**
 * Bir iş emrini kesintiye bağlar (`workOrderId`i doldurur). Yalnızca UPDATE
 * yapar, status/history dokunmaz — `work-order.linked` consumer'ı bunu
 * kullanır (Savunma 2: linked event'leri asla yeni kayıt açmaz).
 */
export async function linkWorkOrderTx(tx: Tx, outageId: string, workOrderId: string): Promise<OutageRow | null> {
  const [row] = await tx
    .update(outages)
    .set({ workOrderId, version: sql`${outages.version} + 1`, updatedAt: new Date() })
    .where(eq(outages.id, outageId))
    .returning();

  return row ?? null;
}

export async function getHistory(outageId: string): Promise<OutageStatusHistoryRow[]> {
  return db
    .select()
    .from(outageStatusHistory)
    .where(eq(outageStatusHistory.outageId, outageId))
    .orderBy(desc(outageStatusHistory.changedAt));
}

