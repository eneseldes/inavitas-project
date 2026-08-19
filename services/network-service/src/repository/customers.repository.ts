import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.ts';
import { customerPii, customers } from '../db/schema.ts';

export type CustomerRow = typeof customers.$inferSelect;
export type CustomerPiiRow = typeof customerPii.$inferSelect;

export interface CustomerFilters {
  unitPath?: string;
  customerType?: string;
  status?: string;
  parentId?: string;
  tmId?: string;
  feederId?: string;
  dmId?: string;
  transformerId?: string;
  /** Belirli bir şebeke elemanına (herhangi bir üst kademe kolonundan) bağlı abonelerle eşleşir. */
  componentId?: string;
  scope?: SQL;
}

/** Sıralama yapılabilecek alanlar. */
export const SORTABLE_FIELDS = ['id'] as const;

const SORT_COLUMNS = {
  id: customers.id,
} as const;

function buildConditions(filters: CustomerFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.unitPath) conditions.push(sql`${customers.unitPath} <@ ${filters.unitPath}::ltree`);
  if (filters.customerType) conditions.push(eq(customers.customerType, filters.customerType));
  if (filters.status) conditions.push(eq(customers.status, filters.status));
  if (filters.parentId) conditions.push(eq(customers.parentId, filters.parentId));
  if (filters.tmId) conditions.push(eq(customers.tmId, filters.tmId));
  if (filters.feederId) conditions.push(eq(customers.feederId, filters.feederId));
  if (filters.dmId) conditions.push(eq(customers.dmId, filters.dmId));
  if (filters.transformerId) conditions.push(eq(customers.transformerId, filters.transformerId));
  if (filters.componentId) {
    const id = filters.componentId;
    conditions.push(
      or(
        eq(customers.parentId, id),
        eq(customers.tmId, id),
        eq(customers.feederId, id),
        eq(customers.dmId, id),
        eq(customers.transformerId, id),
      )!,
    );
  }
  if (filters.scope) conditions.push(filters.scope);

  return conditions;
}

/** Aboneleri filtreler, sıralar ve sayfalanmış olarak listeler (PII hariç). */
export async function list(
  filters: CustomerFilters,
  pagination: PaginationQuery,
  sort: SortOrder,
): Promise<{ items: CustomerRow[]; total: number }> {
  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const column = SORT_COLUMNS[sort.field as (typeof SORTABLE_FIELDS)[number]] ?? customers.id;
  const orderBy = sort.dir === 'asc' ? asc(column) : desc(column);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, totalRows] = await Promise.all([
    db.select().from(customers).where(where).orderBy(orderBy).limit(pagination.pageSize).offset(offset),
    db.select({ value: count() }).from(customers).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/** Abone ID ile tek kaydı arar (PII hariç). */
export async function findById(id: string): Promise<CustomerRow | null> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  return row ?? null;
}

/** Abonenin PII (tesisat/sözleşme) kaydını arar — ayrı izin gerektirir. */
export async function findPiiById(id: string): Promise<CustomerPiiRow | null> {
  const [row] = await db.select().from(customerPii).where(eq(customerPii.id, id));
  return row ?? null;
}

/** Etki olayında taşınan, PII içermeyen abone özeti. */
export interface AffectedCustomerRow {
  id: string;
  unitPath: string;
  customerType: string | null;
}

/**
 * Etki hesabının döndürdüğü abone kimliklerini PII'sız özet satırlarına çevirir.
 * `outage.impact.calculated` olayının abone kümesi buradan doldurulur — `outage-service`
 * ayrıca sormaz, bu yüzden yalnız read-model'e yazılacak üç alan okunur.
 */
export async function findAffectedByIds(ids: string[]): Promise<AffectedCustomerRow[]> {
  if (ids.length === 0) return [];

  return db
    .select({ id: customers.id, unitPath: customers.unitPath, customerType: customers.customerType })
    .from(customers)
    .where(inArray(customers.id, ids));
}
