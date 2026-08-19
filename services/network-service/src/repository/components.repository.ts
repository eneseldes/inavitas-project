import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, sql, type SQL } from 'drizzle-orm';
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

/**
 * Alan sorgusunun sunucu tarafı üst sınırı. Ankara'nın tamamını saran bir poligon 593 bin
 * satır demektir; kullanıcıya "daralt" demek, listeyi sonsuza kadar akıtmaktan iyidir.
 */
export const WITHIN_ROW_LIMIT = 5000;

/** Alan sorgusu satırı — eleman kaydı + mahalle ve ilçe adı. */
export type ComponentAreaRow = ComponentRow & { unitName: string | null; districtName: string | null };

/** Poligonu SRID'i belli, kendini kesiyorsa onarılmış bir geometriye çevirir. */
function searchArea(polygon: unknown): SQL {
  return sql`ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(polygon)}), 4326))`;
}

/**
 * Poligonun kullanılabilir olup olmadığını söyler. Kendini kesen bir poligon `ST_MakeValid`
 * ile onarılır; onarım sonucu boş ya da alansız kalıyorsa sorgu hiç çalıştırılmaz — boş bir
 * liste dönmek kullanıcıya "bu alanda hiçbir şey yok" der, oysa sorun poligonun kendisidir.
 */
export async function checkSearchArea(polygon: unknown): Promise<{ usable: boolean; reason: string | null }> {
  const area = searchArea(polygon);
  const result = await db.execute(sql`
    SELECT NOT ST_IsEmpty(${area}) AND ST_Dimension(${area}) = 2 AS usable,
           ST_IsValidReason(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(polygon)}), 4326)) AS reason
  `);

  const row = result.rows[0] as unknown as { usable: boolean; reason: string | null } | undefined;
  return { usable: row?.usable ?? false, reason: row?.reason ?? null };
}

/**
 * Poligonun içine düşen elemanları sayfalı olarak getirir.
 *
 * Toplam sayı `WITHIN_ROW_LIMIT + 1` satıra kadar sayılır: tam sayım için tüm poligonu
 * taramak (mekânsal indeks bir yere kadar yardım eder) pahalıdır ve sınırı aşan bir sonuçta
 * kesin sayının hiçbir değeri yoktur — kullanıcıya söylenecek şey zaten "daraltın".
 */
export async function listWithin(
  polygon: unknown,
  filters: ComponentFilters,
  pagination: PaginationQuery,
): Promise<{ items: ComponentAreaRow[]; total: number; overflowed: boolean }> {
  const conditions = buildConditions(filters);
  conditions.push(sql`ST_Intersects(${components.geom}, ${searchArea(polygon)})`);
  const where = and(...conditions);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, countRows] = await Promise.all([
    db
      // Mahalle ve ilçe adı listede gösterilir; `unit_path` ("TR.06.012.0137") kullanıcıya
      // bir şey söylemez. `districtName` mahalle satırında zaten denormalize durur, ikinci
      // bir birleştirme gerekmez. Tek satırlık bir birleştirme, her satır için ayrı sorgudan ucuzdur.
      .select({ ...getTableColumns(components), unitName: units.name, districtName: units.districtName })
      .from(components)
      .leftJoin(units, eq(units.path, components.unitPath))
      .where(where)
      .orderBy(asc(components.topologyLevel), asc(components.id))
      .limit(pagination.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(db.select({ id: components.id }).from(components).where(where).limit(WITHIN_ROW_LIMIT + 1).as('capped')),
  ]);

  const counted = countRows[0]?.value ?? 0;
  const overflowed = counted > WITHIN_ROW_LIMIT;

  return { items, total: overflowed ? WITHIN_ROW_LIMIT : counted, overflowed };
}

/** Eleman ID ile tek kaydı arar. */
export async function findById(id: string): Promise<ComponentRow | null> {
  const [row] = await db.select().from(components).where(eq(components.id, id));
  return row ?? null;
}

/** Birden çok eleman ID'sini tek sorguda getirir (besleme zinciri gibi küçük kimlik kümeleri için). */
export async function findByIds(ids: string[]): Promise<ComponentRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(components).where(inArray(components.id, ids));
}

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * Verilen eleman kümesinin kapsayan dikdörtgenini (`ST_Extent`) tek sorguda hesaplar.
 * Harita odağı (`fitBounds`) için — istemci binlerce koordinatı tek tek toplamaz.
 */
export async function findBoundingBox(ids: string[]): Promise<Bbox | null> {
  if (ids.length === 0) return null;

  const result = await db.execute(sql`
    SELECT ST_XMin(ext) AS min_lon, ST_YMin(ext) AS min_lat, ST_XMax(ext) AS max_lon, ST_YMax(ext) AS max_lat
    FROM (SELECT ST_Extent(${components.geom}) AS ext FROM ${components} WHERE ${inArray(components.id, ids)}) t
  `);

  const row = result.rows[0] as unknown as
    | { min_lon: number | null; min_lat: number | null; max_lon: number | null; max_lat: number | null }
    | undefined;

  if (!row || row.min_lon === null || row.min_lat === null || row.max_lon === null || row.max_lat === null) {
    return null;
  }

  return { minLon: row.min_lon, minLat: row.min_lat, maxLon: row.max_lon, maxLat: row.max_lat };
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
