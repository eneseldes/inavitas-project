import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.ts';
import { units } from '../db/schema.ts';

/**
 * Seed'de `center_lat`/`center_lon` yalnız ilçe ve mahallelerde dolu; il satırında boş
 * kalmış (ama `centroid` geometrisi var). Haritadaki il etiketi gibi tüketiciler boş
 * merkezle çalışamayacağından değer burada geometriden tamamlanır.
 */
const unitSelection = {
  ...getTableColumns(units),
  centerLat: sql<number | null>`COALESCE(${units.centerLat}, ST_Y(${units.centroid}))`.as('center_lat'),
  centerLon: sql<number | null>`COALESCE(${units.centerLon}, ST_X(${units.centroid}))`.as('center_lon'),
};

export type UnitRow = typeof units.$inferSelect;

export interface UnitFilters {
  level?: string;
  parentPath?: string;
  scope?: SQL;
}

/** Sıralama yapılabilecek alanlar. */
export const SORTABLE_FIELDS = ['name', 'path', 'level'] as const;

const SORT_COLUMNS = {
  name: units.name,
  path: units.path,
  level: units.level,
} as const;

function buildConditions(filters: UnitFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.level) conditions.push(eq(units.level, filters.level));
  if (filters.parentPath) conditions.push(sql`${units.parentPath} = ${filters.parentPath}::ltree`);
  if (filters.scope) conditions.push(filters.scope);

  return conditions;
}

/** İdari birimleri filtreler, sıralar ve sayfalanmış olarak listeler. */
export async function list(
  filters: UnitFilters,
  pagination: PaginationQuery,
  sort: SortOrder,
): Promise<{ items: UnitRow[]; total: number }> {
  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const column = SORT_COLUMNS[sort.field as (typeof SORTABLE_FIELDS)[number]] ?? units.path;
  const orderBy = sort.dir === 'asc' ? asc(column) : desc(column);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, totalRows] = await Promise.all([
    db.select(unitSelection).from(units).where(where).orderBy(orderBy).limit(pagination.pageSize).offset(offset),
    db.select({ value: count() }).from(units).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/** Birim yolu (`path`) ile tek kaydı arar. */
export async function findByPath(path: string): Promise<UnitRow | null> {
  const [row] = await db
    .select(unitSelection)
    .from(units)
    .where(sql`${units.path} = ${path}::ltree`);
  return row ?? null;
}

/** Bir birimin doğrudan çocuklarını sayfalanmış olarak listeler. */
export async function children(
  path: string,
  pagination: PaginationQuery,
  sort: SortOrder,
  scope?: SQL,
): Promise<{ items: UnitRow[]; total: number }> {
  return list({ parentPath: path, scope }, pagination, sort);
}
