import type { PaginationQuery, SortOrder } from '@edas/shared';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import { db } from '../db.ts';
import { outages } from '../db/schema.ts';
import type { OutageStatus } from '../domain/state-machine.ts';

/** Drizzle'ı yalnızca bu katman bilir; controller/service düz nesnelerle çalışır. */
export type OutageRow = typeof outages.$inferSelect;

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
  if (filters.gisId) conditions.push(eq(outages.gisId, filters.gisId));
  if (filters.startedAtFrom) conditions.push(gte(outages.startedAt, filters.startedAtFrom));
  if (filters.startedAtTo) conditions.push(lt(outages.startedAt, filters.startedAtTo));
  if (filters.createdAtFrom) conditions.push(gte(outages.createdAt, filters.createdAtFrom));
  if (filters.createdAtTo) conditions.push(lt(outages.createdAt, filters.createdAtTo));
  if (filters.hasWorkOrder === true) conditions.push(isNotNull(outages.workOrderId));
  if (filters.hasWorkOrder === false) conditions.push(isNull(outages.workOrderId));

  return conditions;
}

export async function create(input: CreateOutageInput): Promise<OutageRow> {
  const [row] = await db.insert(outages).values(input).returning();
  return row!;
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
export async function updateWithVersion(
  id: string,
  expectedVersion: number,
  patch: { status?: OutageStatus; endedAt?: Date | null; workOrderId?: string | null },
): Promise<OutageRow | null> {
  const [row] = await db
    .update(outages)
    .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(outages.id, id), eq(outages.version, expectedVersion)))
    .returning();

  return row ?? null;
}
