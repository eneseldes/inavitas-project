/**
 * Vurgu kümesinin vector tile'ı.
 *
 * Ana tile üretimiyle (`modules/tiles/service.ts`) aynı `ST_AsMVT` kalıbını kullanır, **üç**
 * farkla:
 *
 * 1. LOD tablosu ana tile'ınkinden **belirgin biçimde gevşektir** (bkz. `HIGHLIGHT_MIN_ZOOM`):
 *    kümedeki eleman, kendi katmanı o zoom'da kapalı olsa bile çizilir. "Downstream'de LV
 *    hattı hiç görünmüyor" sorunu buradan çıkıyordu ve çözümü LOD'u tamamen kaldırmaktı —
 *    ama sınırsız küme (600 bin eleman) her tile'da bütün şebekeyi sadeleştirmeye çalışıyordu.
 *    Şimdi ortası: irtibat hattı/kofra ve AG yalnız kendi bantlarının **çok altına** inince
 *    düşer, o zoom'da zaten piksel altı bir lekedirler.
 * 2. Düşük zoom'da eleman **atılmaz, birleştirilir**: `HIGHLIGHT_DETAIL_ZOOM` altında geometri
 *    (rol, tip, geometri türü) üçlüsüne göre `ST_Collect` ile tek özelliğe toplanır. Binlerce
 *    ayrı çizgi yerine tile başına birkaç özellik çıkar.
 * 3. Kimlikler Postgres'e **virgüllü tek metin** olarak gider ve orada `string_to_table` ile
 *    açılır. Dizi parametresi (600 bin elemanlı `text[]`) hem Node'da hem sürücüde eleman
 *    başına iş demekti; metin tek parça taşınır.
 *
 * `BUS`, `FEEDER` ve `LV_BUS` kümeden düşer: kaynak veride sahibi oldukları birimle **birebir
 * aynı koordinattadırlar**, çizilirlerse birimin üstüne görünmez bir nokta koymaktan başka bir
 * şey yapmazlar (aynı gerekçe: tiles/zoom-lod.ts uyarısı).
 */

import { PERMISSIONS, scopeFilterAnyUnit, type AuthenticatedUser } from '@inavitas/shared';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../db.ts';
import { components } from '../../db/schema.ts';
import type { HighlightSet } from './sets.ts';

const TILE_EXTENT = 4096;

/**
 * Vurgu kümesinin KENDİ LOD tablosu — ana tile'ın `TYPE_MIN_ZOOM`'undan **kasten** gevşektir.
 *
 * Kural: bir tip, kendi katmanının açıldığı zoom'un birkaç kademe altına kadar vurguda
 * kalır; ancak orada da piksel altı bir kütleye dönüştüğü noktada düşer. Böylece "izi
 * açtım, AG kısmı hiç boyanmıyor" durumu geri gelmez ama tek bir z8 tile'ı 600 bin
 * geometriyi sadeleştirmek zorunda kalmaz.
 *
 * Burada **olmayan** her tip her zoom'da çizilir (HV/MV omurga, TM, DM, trafo): iz ve
 * enerjisizlik esas olarak onlar üzerinden okunur ve sayıları küçüktür.
 */
const HIGHLIGHT_MIN_ZOOM: Record<string, number> = {
  // Ana tile: 15. Vurguda 12'ye kadar iner — bir trafo altındaki AG ağı z12'de hâlâ
  // etkilenen alanın gerçek yayılımını gösterir.
  LV_LINE: 12,
  LV_JUNCTION: 12,
  // Ana tile: 16,5. Ev girişleri ancak bina ölçeğinde bir şey anlatır.
  SERVICE_DROP: 14,
};

/**
 * Kofra `type` ile değil `breaker_role` ile ayrıldığı için tabloda değil, ayrı durur —
 * ana tile'daki `includeServiceEntry` ile aynı ayrım (bkz. tiles/service.ts).
 */
const SERVICE_ENTRY_MIN_ZOOM = 14;

/**
 * Bu zoom'dan itibaren kümedeki her eleman ayrı bir MVT özelliğidir; altında rol+tip bazında
 * birleştirilir. 14, bina izinin açıldığı zoom'un (16) iki altı: tek tek elemanın hâlâ
 * ayırt edilebildiği ama tile'ın onbinlerce özellik taşımadığı bant.
 */
const HIGHLIGHT_DETAIL_ZOOM = 14;

/** MVT katman adı — istemcideki `HIGHLIGHT_SOURCE_LAYER` ile aynı olmalı. */
const HIGHLIGHT_SOURCE_LAYER = 'highlight';

/**
 * Sadeleştirme toleransı (derece). Bir "extent birimi"nin altındaki detay ekranda zaten
 * görünmez; 1,5 extent birimi hedeflenir. `preserveCollapsed = true` ile kısa hatlar
 * **kaybolmaz**, iki noktalı hâle iner — kümeden eleman düşürmemek esas kuraldır.
 */
function simplifyTolerance(z: number): number {
  return (360 / 2 ** z / TILE_EXTENT) * 1.5;
}

/** Kümenin `z/x/y` karesine düşen parçasının MVT bayt dizisi. */
export async function renderHighlightTile(
  { z, x, y }: { z: number; x: number; y: number },
  set: HighlightSet,
  user: AuthenticatedUser,
): Promise<Buffer> {
  const scope =
    scopeFilterAnyUnit(user, components.unitPath, components.unitPaths, PERMISSIONS.NETWORK_READ) ?? sql`true`;
  const tolerance = simplifyTolerance(z);

  // Bu zoom'da vurguya girmeyecek tipler. Liste boşsa filtre hiç eklenmez.
  //
  // ⚠️ `open` rolü LOD'dan **muaftır**: açık kesici, kesintinin kökünü gösteren tekil bir
  // işarettir (bir kesintide en fazla birkaç tane) ve her zoom'da görünmelidir — zaten bina
  // izinin açılmadığı zoom'larda görünsün diye vurgu kaynağına taşınmıştı.
  const hiddenTypes = Object.entries(HIGHLIGHT_MIN_ZOOM)
    .filter(([, minZoom]) => z < minZoom)
    .map(([type]) => type);
  const hideServiceEntry = z < SERVICE_ENTRY_MIN_ZOOM;
  const typeFilters: SQL[] = [];
  if (hiddenTypes.length > 0) typeFilters.push(sql`${components.type} <> ALL(${sql.param(hiddenTypes)}::text[])`);
  if (hideServiceEntry) typeFilters.push(sql`${components.breakerRole} IS DISTINCT FROM 'SERVICE_ENTRY'`);
  const lodFilter: SQL =
    typeFilters.length > 0 ? sql`AND (m.role = 'open' OR (${sql.join(typeFilters, sql` AND `)}))` : sql``;

  // Rol başına TEK bir metin parametresi — kimlik başına parametre/dizi elemanı yok.
  const memberSelects = set.groups.map(
    (group) => sql`SELECT ${group.role}::text AS role, id FROM string_to_table(${group.joinedIds}, ',') AS id`,
  );

  // Ayrıntı ve toplu mod aynı sütun listesini üretir; tek fark GROUP BY'dır. İki ayrı SQL
  // yazmak yerine tek şablonun bu parçası değiştirilir ki iki kolon listesi ayrışmasın.
  const features = z >= HIGHLIGHT_DETAIL_ZOOM
    ? sql`
        SELECT
          ST_AsMVTGeom(ST_Transform(ST_Simplify(p.geom, ${tolerance}, true), 3857),
            (SELECT tile_3857 FROM bounds)) AS geom,
          p.id AS id,
          p.role AS role,
          p.type AS type
        FROM picked p`
    : sql`
        SELECT
          ST_AsMVTGeom(ST_Transform(ST_Simplify(ST_Collect(p.geom), ${tolerance}, true), 3857),
            (SELECT tile_3857 FROM bounds)) AS geom,
          NULL::varchar AS id,
          p.role AS role,
          p.type AS type
        FROM picked p
        GROUP BY p.role, p.type, ST_GeometryType(p.geom)`;

  // Küme boşsa (TTL sırasında rol grupları boşalmış olabilir) sorgu bile açılmaz: boş bir
  // `UNION ALL` listesi geçersiz SQL üretirdi.
  if (memberSelects.length === 0) return Buffer.alloc(0);

  const result = await db.execute(sql`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS tile_3857
    ),
    -- Kümeyi kuran taraf rol çakışmalarını zaten çözdü (bkz. sets.ts ROLE_PRIORITY);
    -- burada her kimlik tek satırdır. Kimlikler rol başına virgüllü TEK metin olarak
    -- gelir ve string_to_table ile açılır: 600 bin elemanlı bir text[] parametresi hem
    -- Node'da hem sürücüde eleman başına iş demekti.
    members AS (
      ${sql.join(memberSelects, sql` UNION ALL `)}
    ),
    picked AS (
      SELECT
        ${components.id} AS id,
        m.role AS role,
        ${components.type} AS type,
        ${components.geom} AS geom
      FROM ${components}
      JOIN members m ON m.id = ${components.id},
      bounds
      WHERE ${scope}
        AND ${components.geom} && ST_Transform(bounds.tile_3857, 4326)
        AND ${components.type} NOT IN ('BUS', 'FEEDER', 'LV_BUS')
        ${lodFilter}
    ),
    highlight_features AS (${features})
    SELECT COALESCE(
      (SELECT ST_AsMVT(highlight_features, ${HIGHLIGHT_SOURCE_LAYER}, ${TILE_EXTENT}, 'geom')
       FROM highlight_features WHERE geom IS NOT NULL),
      ''::bytea
    ) AS mvt
  `);

  const row = result.rows[0] as unknown as { mvt: Buffer } | undefined;
  return row?.mvt ?? Buffer.alloc(0);
}
