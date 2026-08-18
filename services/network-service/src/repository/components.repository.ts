import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.ts';
import { components, units } from '../db/schema.ts';
import type { UnitRow } from './units.repository.ts';

export type ComponentRow = typeof components.$inferSelect;

export interface ComponentFilters {
  type?: string[];
  category?: string[];
  breakerRole?: string[];
  voltageLevel?: string[];
  topologyLevel?: number;
  unitPath?: string;
  parentId?: string;
  tmId?: string;
  feederId?: string;
  dmId?: string;
  transformerId?: string;
  q?: string;
  scope?: SQL;
}

/** Sıralama yapılabilecek alanlar. */
export const SORTABLE_FIELDS = ['id', 'type', 'topologyLevel', 'name'] as const;

const SORT_COLUMNS = {
  id: components.id,
  type: components.type,
  topologyLevel: components.topologyLevel,
  name: components.name,
} as const;

function buildConditions(filters: ComponentFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.type && filters.type.length > 0) {
    conditions.push(filters.type.length === 1 ? eq(components.type, filters.type[0]!) : inArray(components.type, filters.type));
  }
  if (filters.category && filters.category.length > 0) {
    conditions.push(
      filters.category.length === 1
        ? eq(components.category, filters.category[0]!)
        : inArray(components.category, filters.category),
    );
  }
  if (filters.breakerRole && filters.breakerRole.length > 0) {
    conditions.push(
      filters.breakerRole.length === 1
        ? eq(components.breakerRole, filters.breakerRole[0]!)
        : inArray(components.breakerRole, filters.breakerRole),
    );
  }
  if (filters.voltageLevel && filters.voltageLevel.length > 0) {
    conditions.push(
      filters.voltageLevel.length === 1
        ? eq(components.voltageLevel, filters.voltageLevel[0]!)
        : inArray(components.voltageLevel, filters.voltageLevel),
    );
  }
  if (filters.topologyLevel !== undefined) conditions.push(eq(components.topologyLevel, filters.topologyLevel));
  if (filters.unitPath) conditions.push(sql`${components.unitPath} <@ ${filters.unitPath}::ltree`);
  if (filters.parentId) conditions.push(eq(components.parentId, filters.parentId));
  if (filters.tmId) conditions.push(eq(components.tmId, filters.tmId));
  if (filters.feederId) conditions.push(eq(components.feederId, filters.feederId));
  if (filters.dmId) conditions.push(eq(components.dmId, filters.dmId));
  if (filters.transformerId) conditions.push(eq(components.transformerId, filters.transformerId));
  if (filters.q) conditions.push(ilike(components.name, `%${filters.q}%`));
  if (filters.scope) conditions.push(filters.scope);

  return conditions;
}

/** Şebeke elemanlarını filtreler, sıralar ve sayfalanmış olarak listeler. */
export async function list(
  filters: ComponentFilters,
  pagination: PaginationQuery,
  sort: SortOrder,
): Promise<{ items: ComponentRow[]; total: number }> {
  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const column = SORT_COLUMNS[sort.field as (typeof SORTABLE_FIELDS)[number]] ?? components.id;
  const orderBy = sort.dir === 'asc' ? asc(column) : desc(column);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, totalRows] = await Promise.all([
    db.select().from(components).where(where).orderBy(orderBy).limit(pagination.pageSize).offset(offset),
    db.select({ value: count() }).from(components).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/** Eleman ID ile tek kaydı arar. */
export async function findById(id: string): Promise<ComponentRow | null> {
  const [row] = await db.select().from(components).where(eq(components.id, id));
  return row ?? null;
}

/**
 * Elemanın idari yolundaki tüm ataları (il → ilçe → mahalle) tek GiST sorgusuyla getirir.
 * `network.units` içinde her seviye ayrı bir satır olduğundan `path @> unitPath` ile bulunur.
 */
export async function findUnitAncestors(unitPath: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(units)
    .where(sql`${units.path} @> ${unitPath}::ltree`)
    .orderBy(sql`nlevel(${units.path})`);
}
