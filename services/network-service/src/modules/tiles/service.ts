/**
 * Vector tile üretimi — `ST_AsMVT` ile sunucuda, `network.units` ve `network.components`'tan
 * tek sorguda. Abone haritada bir katman değildir; kofra kesicisi ev girişini temsil eder,
 * abone bilgisi yalnız eleman detayında görünür.
 *
 * ⚠️ Enerji durumu (`is_closed`, `is_energized`, `status`) tile'a gömülmez — aksi halde her
 * manevrada tüm tile cache'i boşalması gerekirdi. Bu bilgi ileride `setFeatureState` ile taşınır.
 *
 * ## Bina izi (z ≥ BUILDING_ZOOM)
 *
 * Kaynak veride kesici, bara ve fider sahibi birimle **birebir aynı koordinattadır**; bina
 * izi bunları ayırt edilebilir kılan tek görünümdür.
 *
 * - Poligon her zaman **düzgün** çokgendir; kenar sayısı birim tipini anlatır:
 *   TM sekizgen · DM beşgen · trafo kare · kofra üçgen.
 * - Kesiciler bağlı oldukları hattın geldiği yöne kümelenir; duvarda değil, merkez ile duvar
 *   arasında **yolun yarısında** dururlar. Bina içi çizgi duvara kadar devam eder.
 * - Birime bağlı hattın yalnız ilk birkaç metresi köşeye çekilir: hatlar kısa bir yelpaze
 *   yapıp hemen kendi ortak güzergâhlarında birleşir.
 * - Binanın altından yalnızca GEÇEN hat kesilmez, yarı saydam poligonun altında solar.
 */

import type { AuthenticatedUser } from '@inavitas/shared';
import { and, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db.ts';
import { components, units } from '../../db/schema.ts';
import { scopeFilter } from '../../http/scope-filter.ts';
import { resolveZoomLod } from './zoom-lod.ts';

const TILE_EXTENT = 4096;

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

function withScope(base: SQL, scope: SQL | undefined): SQL {
  return scope ? and(base, scope)! : base;
}

/** `z/x/y` karesi için MVT (Mapbox Vector Tile) bayt dizisini üretir. */
export async function renderTile({ z, x, y }: TileCoord, user: AuthenticatedUser): Promise<Buffer> {
  const lod = resolveZoomLod(z);

  // Boş liste = "bu zoom'da hiç yok". `inArray` boş diziyle geçersiz SQL üretebildiğinden
  // sabit `false`'a düşürülür.
  const noneMatches = sql`false`;
  const unitCondition = withScope(
    lod.unitLevels.length > 0 ? inArray(units.level, lod.unitLevels) : noneMatches,
    scopeFilter(user, units.path),
  );
  // Tip listesi zoom'dan gelir (bkz. zoom-lod.ts TYPE_MIN_ZOOM). Kofra kesicisi `type` değil
  // `breaker_role` ile ayrıldığı için ayrıca eklenir; diğer kesici rolleri bu katmana hiç girmez.
  const componentCondition = withScope(
    sql`(${lod.componentTypes.length > 0 ? inArray(components.type, lod.componentTypes) : noneMatches}
         OR (${lod.includeServiceEntry} AND ${components.breakerRole} = 'SERVICE_ENTRY'))`,
    scopeFilter(user, components.unitPath),
  );
  // Bina izi CTE'leri `component_features`'tan ayrı sorgulandığı için kapsam filtresini
  // kendileri taşımalı — aksi halde kapsam dışı bir TM'in poligonu tile'a sızardı.
  const buildingScope = scopeFilter(user, components.unitPath) ?? sql`true`;

  const result = await db.execute(sql`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS tile_3857
    ),
    unit_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(${units.geomSimplified}, 3857), bounds.tile_3857) AS geom,
        ${units.path}::text AS path,
        ${units.level} AS level,
        ${units.name} AS name,
        -- İl/ilçe dolgu rengi bandı (0-7) — komşuluk grafiğine göre ÖNCEDEN boyanmıştır
        -- (bkz. db/seed/04-unit-color-band.ts); iki komşu ilçe asla aynı bandı taşımaz.
        -- Eskiden hashtext(path) % 8 ile anlık hesaplanıyordu ve komşuluğu bilmediğinden
        -- çakışabiliyordu.
        ${units.colorBand} AS band
      FROM ${units}, bounds
      WHERE ${unitCondition}
        AND ${units.geomSimplified} && ST_Transform(bounds.tile_3857, 4326)
    ),

    -- Poligonu bu karede ÇİZİLECEK birimler. Zarf 20 m genişletilir: MapLibre her tile'ı
    -- kendi ekran bölgesine kırptığından, sınıra oturan bina komşu karede de üretilmezse
    -- yarısı kaybolur.
    building_unit_ids AS (
      SELECT ${components.id} AS id
      FROM ${components}, bounds
      WHERE ${lod.includeBuildings}
        AND (${components.type} IN ('TM', 'DM', 'TRANSFORMER') OR ${components.breakerRole} = 'SERVICE_ENTRY')
        AND ${buildingScope}
        AND ${components.geom} && ST_Transform(ST_Expand(bounds.tile_3857, 20), 4326)
    ),
    -- ⚠️ Bu karede geçen hatların bağlı olduğu birimler — birim karenin DIŞINDA olsa bile.
    -- Çapa yalnız "binası çizilen" birimlerden türetilseydi, aynı hat TM'in bulunduğu karede
    -- köşeye çekilir komşu karede çekilmezdi; kare sınırında hat tak diye kopardı.
    tile_lines AS (
      SELECT ${components.id} AS id, ${components.parentId} AS parent_id, ${components.type} AS type
      FROM ${components}, bounds
      WHERE ${lod.includeBuildings}
        AND ST_GeometryType(${components.geom}) = 'ST_LineString'
        AND ${components.geom} && ST_Transform(bounds.tile_3857, 4326)
    ),
    anchor_unit_ids AS (
      SELECT cb.tm_id AS id
      FROM tile_lines l
      JOIN ${components} f ON f.id = l.parent_id AND f.type = 'FEEDER'
      JOIN ${components} cb ON cb.id = f.parent_id AND cb.breaker_role = 'TM_FEEDER'
      WHERE l.type = 'MV_LINE' AND cb.tm_id IS NOT NULL
      UNION
      SELECT u.id
      FROM tile_lines l
      JOIN ${components} cb ON cb.parent_id = l.id
      JOIN ${components} u ON u.parent_id = cb.id AND u.type IN ('DM', 'TRANSFORMER')
      -- Kofra bilerek yok: irtibat hattı kofraya çapalanmaz (bkz. unit_breakers).
    ),
    -- Kenar sayısı birim tipini anlatır: TM 8 · DM 5 · trafo 4 · kofra 3. Poligon her zaman
    -- DÜZGÜNDÜR; bağlantı sayısı şekli değiştirmez, yalnız kesicilerin açısını belirler.
    layout_units AS (
      SELECT
        ${components.id} AS id,
        CASE WHEN ${components.breakerRole} = 'SERVICE_ENTRY' THEN 'SERVICE_ENTRY' ELSE ${components.type} END AS type,
        ${components.geom} AS geom,
        ${components.parentId} AS parent_id,
        CASE ${components.type} WHEN 'TM' THEN 9.0 WHEN 'DM' THEN 5.5 WHEN 'TRANSFORMER' THEN 4.5 ELSE 2.5 END AS radius,
        CASE ${components.type} WHEN 'TM' THEN 8 WHEN 'DM' THEN 5 WHEN 'TRANSFORMER' THEN 4 ELSE 3 END AS sides,
        (${components.id} IN (SELECT id FROM building_unit_ids)) AS draw_building
      FROM ${components}
      WHERE ${components.id} IN (SELECT id FROM building_unit_ids UNION SELECT id FROM anchor_unit_ids)
    ),

    -- Birimin kesicileri ve o kesiciye bağlı hattın GERÇEK geliş/çıkış açısı.
    unit_breakers AS (
      -- TM fider kesicisi: kesici → FEEDER → MV hattı; hat TM'de BAŞLAR.
      SELECT u.id AS unit_id, u.type AS unit_type, u.geom AS unit_geom, u.radius, u.sides,
             cb.id AS breaker_id, l.id AS line_id, 'start'::text AS line_end,
             ST_Azimuth(u.geom, ST_PointN(l.geom, 2)) AS az
      FROM layout_units u
      JOIN ${components} cb ON u.type = 'TM' AND cb.breaker_role = 'TM_FEEDER' AND cb.tm_id = u.id
      JOIN ${components} f ON f.parent_id = cb.id AND f.type = 'FEEDER'
      JOIN ${components} l ON l.parent_id = f.id AND l.type = 'MV_LINE' AND ST_NPoints(l.geom) >= 2

      UNION ALL

      -- DM / trafo: birimin ebeveyni kendi kesicisi, kesicinin ebeveyni gelen hat.
      -- Hat birimde BİTER (doğrulandı: uç mesafesi 0.0 m).
      SELECT u.id, u.type, u.geom, u.radius, u.sides, cb.id, l.id, 'end',
             ST_Azimuth(u.geom, ST_PointN(l.geom, ST_NPoints(l.geom) - 1))
      FROM layout_units u
      JOIN ${components} cb ON cb.id = u.parent_id
      JOIN ${components} l ON l.id = cb.parent_id AND ST_NPoints(l.geom) >= 2
      WHERE u.type IN ('DM', 'TRANSFORMER')

      UNION ALL

      -- Kofra: birimin KENDİSİ kesicidir. ⚠️ Ebeveyni irtibat hattı DEĞİL, buattır
      -- (LV_JUNCTION); irtibat hattı kofranın kardeşidir. İrtibat hattı buattan kofraya
      -- gittiği için geliş yönü doğrudan buata bakar — ayrı bir hat join'i gerekmez.
      -- Kofra ile buat aynı noktadaysa açı NULL çıkar; 0 (kuzey) varsayılır.
      SELECT u.id, u.type, u.geom, u.radius, u.sides, u.id, NULL::varchar, 'end',
             COALESCE(ST_Azimuth(u.geom, j.geom), 0)
      FROM layout_units u
      JOIN ${components} j ON j.id = u.parent_id
      WHERE u.type = 'SERVICE_ENTRY'
    ),

    -- Fiderlerin çoğu TM'den aynı yönde çıkar (ölçüldü: 14 fiderin 8'i tam 236°'de). Aynı
    -- yöndeki kesiciler bir küme sayılıp kümenin gerçek açısı çevresinde dar bir yelpazeye
    -- açılır — hat hep geldiği taraftan girer, üst üste binmez.
    unit_clustered AS (
      SELECT ub.*,
             COUNT(*) OVER w AS cluster_n,
             ROW_NUMBER() OVER (PARTITION BY ub.unit_id, floor(degrees(ub.az) / 5) ORDER BY ub.breaker_id) - 1 AS cluster_j,
             AVG(ub.az) OVER w AS cluster_az
      FROM unit_breakers ub
      WINDOW w AS (PARTITION BY ub.unit_id, floor(degrees(ub.az) / 5))
    ),
    -- Poligonun dönüşü: kesici açılarının dairesel ortalaması. Böylece bir köşe, bağlantıların
    -- yoğunlaştığı yöne bakar ama şekil düzgün kalır.
    unit_phase AS (
      SELECT unit_id, atan2(AVG(sin(az)), AVG(cos(az))) AS phi
      FROM unit_breakers GROUP BY unit_id
    ),
    unit_corners AS (
      SELECT c.unit_id, c.unit_type, c.unit_geom, c.radius, c.sides, c.breaker_id,
             c.line_id, c.line_end, a.theta,
             -- Düzgün çokgende, merkezden theta yönünde duvara olan mesafe. İç yarıçap
             -- (kenar ortası) r*cos(pi/n); köşeye yaklaştıkça 1/cos(alpha) ile büyür.
             w.wall_dist,
             ST_Project(c.unit_geom::geography, w.wall_dist, a.theta)::geometry AS wall_geom,
             -- Kesici duvarda değil, merkez ile duvar arasında yolun yarısındadır.
             ST_Project(c.unit_geom::geography, w.wall_dist * 0.5, a.theta)::geometry AS breaker_geom
      FROM unit_clustered c
      JOIN unit_phase p ON p.unit_id = c.unit_id
      CROSS JOIN LATERAL (
        SELECT CASE WHEN c.unit_type = 'TM'
                    -- Küme içinde kesici başına 10°'lik yelpaze, küme açısına ortalanmış.
                    THEN c.cluster_az + (c.cluster_j - (c.cluster_n - 1) / 2.0) * radians(10)
                    ELSE c.az END AS theta
      ) a
      CROSS JOIN LATERAL (
        SELECT c.radius * cos(pi() / c.sides)
             / cos((a.theta - p.phi - pi() / c.sides)
                   - (2 * pi() / c.sides) * round((a.theta - p.phi - pi() / c.sides) / (2 * pi() / c.sides))) AS wall_dist
      ) w
    ),

    -- Birime bağlı hattın yalnız ilk/son birkaç metresi köşeye çekilir; gerisi kendi gerçek
    -- güzergâhında kalır. Yelpaze bu yüzden kısa olur ve hatlar hemen birleşir.
    line_anchors AS (
      SELECT line_id,
             MAX(wall_geom) FILTER (WHERE line_end = 'start') AS start_pt,
             MAX(radius * 2.5) FILTER (WHERE line_end = 'start') AS start_d,
             MAX(wall_geom) FILTER (WHERE line_end = 'end') AS end_pt,
             MAX(radius * 2.5) FILTER (WHERE line_end = 'end') AS end_d
      FROM unit_corners
      WHERE line_id IS NOT NULL
      GROUP BY line_id
    ),
    component_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(g.geom, 3857), bounds.tile_3857) AS geom,
        ${components.id} AS id,
        ${components.parentId} AS parent_id,
        ${components.type} AS type,
        ${components.category} AS category,
        ${components.breakerRole} AS breaker_role,
        ${components.voltageLevel} AS voltage_level,
        ${components.topologyLevel} AS topology_level,
        ${components.name} AS name
      -- ⚠️ LEFT JOIN virgüllü join'DEN ÖNCE gelmeli: "FROM c, bounds LEFT JOIN a ON a.x = c.y"
      -- yazılırsa ON içindeki c görünmez olur ve sorgu patlar.
      FROM ${components}
      LEFT JOIN line_anchors a ON a.line_id = ${components.id},
      bounds
      CROSS JOIN LATERAL (
        SELECT ST_Length(${components.geom}::geography) AS len
      ) m
      CROSS JOIN LATERAL (
        SELECT
          CASE WHEN a.start_pt IS NOT NULL AND m.len > a.start_d * 2 THEN a.start_d / m.len ELSE 0 END AS f0,
          CASE WHEN a.end_pt IS NOT NULL AND m.len > a.end_d * 2 THEN 1 - a.end_d / m.len ELSE 1 END AS f1
      ) f
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN a.start_pt IS NULL AND a.end_pt IS NULL THEN ${components.geom}
          WHEN f.f0 >= f.f1 THEN ${components.geom}
          ELSE (
            SELECT CASE
              WHEN a.start_pt IS NOT NULL AND a.end_pt IS NOT NULL
                THEN ST_MakeLine(a.start_pt, ST_MakeLine(core.g, a.end_pt))
              WHEN a.start_pt IS NOT NULL THEN ST_MakeLine(a.start_pt, core.g)
              ELSE ST_MakeLine(core.g, a.end_pt)
            END
            FROM (SELECT ST_LineSubstring(${components.geom}, f.f0, f.f1) AS g) core
          )
        END AS geom
      ) g
      WHERE ${componentCondition}
        AND ${components.geom} && ST_Transform(bounds.tile_3857, 4326)
    ),

    -- Poligon halkaları: dış yumuşak "halo" ve asıl duvar. Halka açıkça kapatılır —
    -- ST_Project geodezik olduğundan son köşe ilkiyle bit bit aynı çıkmaz ve
    -- ST_MakePolygon "shell must be closed" hatası verir.
    building_rings AS (
      SELECT u.id, u.type AS unit_type, ring.kind AS ring,
             ST_MakeLine(ST_Project(u.geom::geography, u.radius * ring.mult, p.phi + 2 * pi() * k.k / u.sides)::geometry ORDER BY k.k) AS line
      FROM layout_units u
      JOIN unit_phase p ON p.unit_id = u.id,
      (VALUES ('halo', 1.45), ('wall', 1.0)) AS ring(kind, mult),
      LATERAL generate_series(0, u.sides - 1) AS k(k)
      WHERE u.draw_building
      GROUP BY u.id, u.type, ring.kind
    ),
    -- ⚠️ Son argüman clip_geom = false: bina izi birimin noktasını içeren karede bütün
    -- üretilir; kırpma açıkken kare kenarındaki poligon dikdörtgene dönüşüyordu.
    building_shape_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(ST_MakePolygon(ST_AddPoint(r.line, ST_StartPoint(r.line))), 3857),
          bounds.tile_3857, ${TILE_EXTENT}, 8, false) AS geom,
        r.id, r.unit_type, r.ring
      FROM building_rings r, bounds
    ),
    -- Bina içi yol: duvardan birimin kendisine; kesici bu yolun ortasında durur.
    building_inner_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(ST_MakeLine(c.wall_geom, c.unit_geom), 3857),
          bounds.tile_3857, ${TILE_EXTENT}, 8, false) AS geom,
        c.breaker_id AS id, c.unit_id, c.unit_type
      FROM unit_corners c
      JOIN layout_units u ON u.id = c.unit_id AND u.draw_building, bounds
    ),
    building_breaker_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(c.breaker_geom, 3857), bounds.tile_3857, ${TILE_EXTENT}, 8, false) AS geom,
        c.breaker_id AS id, c.unit_id, c.unit_type
      FROM unit_corners c
      JOIN layout_units u ON u.id = c.unit_id AND u.draw_building, bounds
    )
    SELECT
      COALESCE((SELECT ST_AsMVT(unit_features, 'units', ${TILE_EXTENT}, 'geom') FROM unit_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(component_features, 'components', ${TILE_EXTENT}, 'geom') FROM component_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(building_shape_features, 'building_shapes', ${TILE_EXTENT}, 'geom') FROM building_shape_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(building_inner_features, 'building_inner', ${TILE_EXTENT}, 'geom') FROM building_inner_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(building_breaker_features, 'building_breakers', ${TILE_EXTENT}, 'geom') FROM building_breaker_features), ''::bytea)
      AS mvt
  `);

  const row = result.rows[0] as unknown as { mvt: Buffer } | undefined;
  return row?.mvt ?? Buffer.alloc(0);
}
