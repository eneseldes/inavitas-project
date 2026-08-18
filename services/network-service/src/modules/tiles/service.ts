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

  const result = await db.execute(sql`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS tile_3857
    ),
    unit_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(${units.geomSimplified}, 3857), bounds.tile_3857) AS geom,
        ${units.path}::text AS path,
        ${units.level} AS level,
        ${units.name} AS name
      FROM ${units}, bounds
      WHERE ${unitCondition}
        AND ${units.geomSimplified} && ST_Transform(bounds.tile_3857, 4326)
    ),
    component_features AS (
      SELECT
        ST_AsMVTGeom(ST_Transform(${components.geom}, 3857), bounds.tile_3857) AS geom,
        ${components.id} AS id,
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
    )
    SELECT
      COALESCE((SELECT ST_AsMVT(unit_features, 'units', ${TILE_EXTENT}, 'geom') FROM unit_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(component_features, 'components', ${TILE_EXTENT}, 'geom') FROM component_features), ''::bytea)
      || COALESCE((SELECT ST_AsMVT(customer_features, 'customers', ${TILE_EXTENT}, 'geom') FROM customer_features), ''::bytea)
      AS mvt
  `);

  const row = result.rows[0] as unknown as { mvt: Buffer } | undefined;
  return row?.mvt ?? Buffer.alloc(0);
}
