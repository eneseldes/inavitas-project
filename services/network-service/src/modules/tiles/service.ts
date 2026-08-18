/**
 * Vector tile üretimi — `ST_AsMVT` ile sunucuda, `network.units`/`network.components`/
 * `customer.customers`'tan tek sorguda.
 *
 * ⚠️ Enerji durumu (`is_closed`, `is_energized`, `status`) tile'a gömülmez — aksi halde her
 * manevrada tüm tile cache'i boşalması gerekirdi. Bu bilgi ileride `setFeatureState` ile taşınır.
 */

import type { AuthenticatedUser } from '@inavitas/shared';
import { and, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db.ts';
import { components, customers, units } from '../../db/schema.ts';
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

  const unitCondition = withScope(inArray(units.level, lod.unitLevels), scopeFilter(user, units.path));
  const componentCondition = withScope(
    sql`${components.topologyLevel} <= ${lod.maxTopologyLevel}`,
    scopeFilter(user, components.unitPath),
  );
  const customerCondition = withScope(
    sql`${lod.includeCustomers}`,
    scopeFilter(user, customers.unitPath),
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
        -- İl/ilçe dolgu rengi bandı (0-7) — path "TR.06.021" gibi bir ltree metni olduğundan
        -- istemcide sayıya çevrilemez; deterministik hash burada, hashtext ile hesaplanır.
        -- Bant sayısı istemcideki UNIT_BAND_COUNT (networkLayers.ts) ile eşleşmelidir.
        abs(hashtext(${units.path}::text)) % 8 AS band
      FROM ${units}, bounds
      WHERE ${unitCondition}
        AND ${units.geomSimplified} && ST_Transform(bounds.tile_3857, 4326)
    ),
    component_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(${components.geom}, 3857), bounds.tile_3857) AS geom,
        ${components.id} AS id,
        ${components.parentId} AS parent_id,
        ${components.type} AS type,
        ${components.category} AS category,
        ${components.breakerRole} AS breaker_role,
        ${components.voltageLevel} AS voltage_level,
        ${components.topologyLevel} AS topology_level,
        ${components.name} AS name
      FROM ${components}, bounds
      WHERE ${componentCondition}
        AND ${components.geom} && ST_Transform(bounds.tile_3857, 4326)
    ),
    customer_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(${customers.geom}, 3857), bounds.tile_3857) AS geom,
        ${customers.id} AS id,
        ${customers.customerType} AS customer_type
      FROM ${customers}, bounds
      WHERE ${customerCondition}
        AND ${customers.geom} && ST_Transform(bounds.tile_3857, 4326)
    ),
    -- Bina izi çizilecek birimler. Yarıçaplar metre cinsindendir ve
    -- ankara-yeni-detayli-v3.html'deki UNIT.r değerleriyle birebir aynıdır.
    building_units AS (
      SELECT
        ${components.id} AS id,
        ${components.type} AS type,
        ${components.geom} AS geom,
        CASE ${components.type} WHEN 'TM' THEN 9.0 WHEN 'DM' THEN 5.5 ELSE 4.5 END AS radius
      FROM ${components}, bounds
      WHERE ${lod.includeBuildings}
        AND ${components.type} IN ('TM', 'DM', 'TRANSFORMER')
        AND ${buildingScope}
        -- Zarf 20 m genişletilir: MapLibre her tile'ı kendi ekran bölgesine kırptığından,
        -- tile sınırına oturan bir bina komşu tile'da da üretilmezse yarısı kaybolur
        -- (en büyük halo yarıçapı 9 × 1,45 × 1,0824 ≈ 14,1 m).
        AND ${components.geom} && ST_Transform(ST_Expand(bounds.tile_3857, 20), 4326)
    ),
    -- Birimin kesicileri. Kaynak veride kesici birimle aynı koordinattadır; burada
    -- duvara eşit açılarla yayılır (ord/total) — TM'de 2-14 fider çıkışı böyle ayrışır.
    -- Kesicinin GERÇEK id'si korunur, yalnız çizim konumu sentetiktir.
    building_breakers AS (
      SELECT
        cb.id AS id,
        u.id AS unit_id,
        u.type AS unit_type,
        u.geom AS unit_geom,
        ST_Project(
          u.geom::geography,
          u.radius,
          2 * pi() * (ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY cb.id) - 1)
            / COUNT(*) OVER (PARTITION BY u.id)
        )::geometry AS geom
      FROM building_units u
      JOIN ${components} cb
        ON (u.type = 'TM' AND cb.breaker_role = 'TM_FEEDER' AND cb.tm_id = u.id)
        OR (u.type = 'DM' AND cb.breaker_role = 'DM_ENTRY' AND cb.dm_id = u.id)
        OR (u.type = 'TRANSFORMER' AND cb.breaker_role = 'TRANSFORMER' AND cb.transformer_id = u.id)
    ),
    -- Poligonun iki halkası: dış yumuşak "halo" ve asıl duvar. ST_Buffer köşeleri
    -- yarıçapta üretir; v3'teki gibi DUVARIN yarıçapta olması için 1/cos(pi/8) ile açılır.
    -- ⚠️ Son argüman clip_geom = false: bina izi birimin noktasını içeren TEK tile'da
    -- üretilir; kırpma açıkken tile kenarındaki poligon sekizgen değil dikdörtgen görünüyordu.
    building_shape_features AS (
      SELECT
        ST_AsMVTGeom(
          ST_Transform(ST_Buffer(u.geom::geography, u.radius * ring.mult * 1.0824, 'quad_segs=2')::geometry, 3857),
          bounds.tile_3857, ${TILE_EXTENT}, 8, false
        ) AS geom,
        u.id AS id,
        u.type AS unit_type,
        ring.kind AS ring
      FROM building_units u, bounds, (VALUES ('halo', 1.45), ('wall', 1.0)) AS ring(kind, mult)
    ),
    -- Bina içi yol: duvardaki kesiciden birimin kendisine.
    building_inner_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(ST_MakeLine(b.geom, b.unit_geom), 3857), bounds.tile_3857, ${TILE_EXTENT}, 8, false) AS geom,
        b.id AS id,
        b.unit_id AS unit_id,
        b.unit_type AS unit_type
      FROM building_breakers b, bounds
    ),
    building_breaker_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(b.geom, 3857), bounds.tile_3857, ${TILE_EXTENT}, 8, false) AS geom,
        b.id AS id,
        b.unit_id AS unit_id,
        b.unit_type AS unit_type
      FROM building_breakers b, bounds
    )
    SELECT
      COALESCE((SELECT ST_AsMVT(unit_features, 'units', ${TILE_EXTENT}, 'geom') FROM unit_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(component_features, 'components', ${TILE_EXTENT}, 'geom') FROM component_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(customer_features, 'customers', ${TILE_EXTENT}, 'geom') FROM customer_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(building_shape_features, 'building_shapes', ${TILE_EXTENT}, 'geom') FROM building_shape_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(building_inner_features, 'building_inner', ${TILE_EXTENT}, 'geom') FROM building_inner_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(building_breaker_features, 'building_breakers', ${TILE_EXTENT}, 'geom') FROM building_breaker_features), ''::bytea)
      AS mvt
  `);

  const row = result.rows[0] as unknown as { mvt: Buffer } | undefined;
  return row?.mvt ?? Buffer.alloc(0);
}
