import { asc, count, eq, ilike, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.ts';
import { unitsRo } from '../db/schema.ts';

/** Birim ağacındaki tek düğüm — sayaçlar ağacı açmadan önce satırda gösterilir. */
export interface UnitNode {
  path: string;
  parentPath: string | null;
  level: string;
  name: string;
  provinceName: string;
  districtName: string | null;
  /** Doğrudan alt birim sayısı; 0 ise satır yaprak olarak çizilir. */
  childCount: number;
  /** Bu birimde (alt ağacı dahil) kapsamı olan kullanıcı sayısı. */
  userCount: number;
}

/**
 * Sayaç alt sorguları. Ağaç tembel yüklendiği için her seferinde en fazla bir seviyenin
 * satırları hesaplanır — 1.463 düğümün tamamı hiç dolaşılmaz.
 *
 * ⚠️ Dış sorgunun kolonu `${unitsRo.path}` ile GEÇİLEMEZ: tek tablolu bir sorguda drizzle
 * onu niteliksiz `"path"` olarak yazar, alt sorgunun içinde bu `child.path`'e bağlanır ve
 * koşul sessizce `child.parent_path = child.path` olur — her satırda 0 döner. Bu yüzden
 * korelasyon tablo adıyla açıkça yazılır.
 */
const childCount = sql<number>`(
  SELECT count(*)::int FROM units_ro child WHERE child.parent_path = units_ro.path
)`;

const userCount = sql<number>`(
  SELECT count(DISTINCT ur.user_id)::int FROM user_roles ur WHERE ur.unit_path <@ units_ro.path
)`;

const nodeSelection = {
  path: unitsRo.path,
  parentPath: unitsRo.parentPath,
  level: unitsRo.level,
  name: unitsRo.name,
  provinceName: unitsRo.provinceName,
  districtName: unitsRo.districtName,
  childCount: childCount.as('child_count'),
  userCount: userCount.as('user_count'),
};

/**
 * Yol listesini TEK bir `ltree[]` parametresine bağlar — düz `${paths}` drizzle tarafından
 * virgüllü ayrı parametrelere açılır ve `::ltree[]` cast'i patlar (bkz. @inavitas/shared
 * scope.ts'teki aynı not).
 */
function ltreeArray(paths: readonly string[]): SQL {
  return sql`${sql.param([...new Set(paths)])}::ltree[]`;
}

async function query(where: SQL | undefined, limit: number, offset: number): Promise<{ items: UnitNode[]; total: number }> {
  const [items, totalRows] = await Promise.all([
    db.select(nodeSelection).from(unitsRo).where(where).orderBy(asc(unitsRo.name)).limit(limit).offset(offset),
    db.select({ value: count() }).from(unitsRo).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/**
 * Bir birimin doğrudan çocukları. `parent` verilmezse ağacın kökleri döner.
 *
 * Tembel yükleme buradan yürür: 1.463 düğümü tek seferde göndermek hem yavaş hem gereksiz.
 */
export async function children(
  parent: string | undefined,
  pagination: { limit: number; offset: number },
): Promise<{ items: UnitNode[]; total: number }> {
  const where = parent ? sql`${unitsRo.parentPath} = ${parent}::ltree` : isNull(unitsRo.parentPath);
  return query(where, pagination.limit, pagination.offset);
}

/**
 * Ad araması — **sunucu tarafındadır**. Eşleşen düğümlerin yanında ataları da döner ki
 * istemci ağacı eşleşmeye kadar açık çizebilsin.
 */
export async function search(
  term: string,
  pagination: { limit: number; offset: number },
): Promise<{ items: UnitNode[]; total: number }> {
  const matches = await query(ilike(unitsRo.name, `%${term}%`), pagination.limit, pagination.offset);
  if (matches.items.length === 0) return matches;

  const ancestorPaths = matches.items.flatMap((item) => {
    const segments = item.path.split('.');
    return segments.slice(0, -1).map((_, idx) => segments.slice(0, idx + 1).join('.'));
  });

  const known = new Set(matches.items.map((i) => i.path));
  const missing = [...new Set(ancestorPaths)].filter((p) => !known.has(p));
  if (missing.length === 0) return matches;

  const ancestors = await db
    .select(nodeSelection)
    .from(unitsRo)
    .where(sql`${unitsRo.path} = ANY(${ltreeArray(missing)})`)
    .orderBy(asc(unitsRo.path));

  // `total` eşleşme sayısıdır; atalar sayfalamanın dışında, ağacı çizebilmek için eklenir.
  return { items: [...ancestors, ...matches.items], total: matches.total };
}

/** Tek birimi yolu ile getirir — kapsam ataması doğrulanırken kullanılır. */
export async function findByPath(path: string): Promise<UnitNode | null> {
  const [row] = await db.select(nodeSelection).from(unitsRo).where(eq(unitsRo.path, path)).limit(1);
  return row ?? null;
}

/** Verilen yollardan `units_ro`'da karşılığı olmayanları döner (doğrulama için). */
export async function findMissingPaths(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];

  const rows = await db
    .select({ path: unitsRo.path })
    .from(unitsRo)
    .where(sql`${unitsRo.path} = ANY(${ltreeArray(paths)})`);

  const existing = new Set(rows.map((r) => r.path));
  return paths.filter((p) => !existing.has(p));
}

/** Birim adlarını yol → ad haritası olarak döner. */
export async function namesByPath(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const rows = await db
    .select({ path: unitsRo.path, name: unitsRo.name })
    .from(unitsRo)
    .where(sql`${unitsRo.path} = ANY(${ltreeArray(paths)})`);

  return new Map(rows.map((r) => [r.path, r.name]));
}
