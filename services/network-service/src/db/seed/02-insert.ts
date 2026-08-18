import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * `staging_seed` şemasındaki ham verileri tip dönüşümleriyle `network` ve `customer` şemalarına aktarır,
 * ardından indeksleri oluşturur ve `staging_seed` şemasını temizler.
 */
export async function insertAndTransformData(db: NodePgDatabase<any>, log: (msg: string) => void): Promise<void> {
  log('[02-insert] Hedef şemalar (network, customer) kontrol ediliyor...');
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS network;`);
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS customer;`);

  log('[02-insert] 1/6 units tablosu dolduruluyor...');
  await db.execute(sql`
    INSERT INTO network.units (
      path, parent_path, level, name, province_name, district_name,
      external_ref, center_lat, center_lon, geom, geom_simplified, centroid, bbox, hamlets
    )
    SELECT
      path::ltree,
      NULLIF(parent_path, '')::ltree,
      level,
      name,
      province_name,
      NULLIF(district_name, ''),
      NULLIF(external_ref, ''),
      center_lat::double precision,
      center_lon::double precision,
      geom,
      ST_SimplifyPreserveTopology(geom, 0.0005) AS geom_simplified,
      ST_Centroid(geom) AS centroid,
      ST_Envelope(geom) AS bbox,
      NULLIF(hamlets, '')::jsonb
    FROM staging_seed.admin_units;
  `);

  log('[02-insert] 2/6 components tablosu dolduruluyor...');
  await db.execute(sql`
    INSERT INTO network.components (
      id, type, category, breaker_role, voltage_level, topology_level,
      parent_id, tm_id, feeder_id, dm_id, transformer_id,
      unit_path, unit_paths, unit_path_source, geom, lat, lon,
      switchable, load_break, normally_open, is_closed, status, is_energized, name, attributes
    )
    SELECT
      id,
      type,
      category,
      NULLIF(breaker_role, ''),
      voltage_level,
      topology_level::integer,
      NULLIF(parent_id, ''),
      NULLIF(tm_id, ''),
      NULLIF(feeder_id, ''),
      NULLIF(dm_id, ''),
      NULLIF(transformer_id, ''),
      unit_path::ltree,
      string_to_array(unit_paths, ',')::ltree[],
      unit_path_source,
      geom,
      lat::double precision,
      lon::double precision,
      switchable::boolean,
      load_break::boolean,
      normally_open::boolean,
      (NOT normally_open::boolean) AS is_closed,
      COALESCE(attributes::jsonb->>'status', 'ENERGIZED') AS status,
      (COALESCE(attributes::jsonb->>'status', 'ENERGIZED') = 'ENERGIZED') AS is_energized,
      attributes::jsonb->>'name' AS name,
      attributes::jsonb
    FROM staging_seed.components;
  `);

  log('[02-insert] 3/6 topology_edges tablosu dolduruluyor...');
  await db.execute(sql`
    INSERT INTO network.topology_edges (
      from_id, to_id, connection_type, is_closed, normally_open, ring_id,
      participates_in_outage_graph, component_id, length_m
    )
    SELECT
      from_id,
      to_id,
      connection_type,
      is_closed::boolean,
      normally_open::boolean,
      NULLIF(ring_id, ''),
      participates_in_outage_graph::boolean,
      NULLIF(component_id, ''),
      length_m::double precision
    FROM staging_seed.topology_edges;
  `);

  log('[02-insert] 4/6 rings tablosu dolduruluyor...');
  await db.execute(sql`
    INSERT INTO network.rings (
      ring_id, ring_type, status, tm_id, tie_switch_ids
    )
    SELECT
      ring_id,
      ring_type,
      status,
      NULLIF(tm_id, ''),
      to_jsonb(string_to_array(NULLIF(tie_switch_ids, ''), ','))
    FROM staging_seed.rings;
  `);

  log('[02-insert] 5/6 customers tablosu dolduruluyor...');
  await db.execute(sql`
    INSERT INTO customer.customers (
      id, parent_id, tm_id, feeder_id, dm_id, transformer_id,
      unit_path, unit_path_source, lat, lon,
      customer_type, voltage, phase, contracted_power_kw, estimated_peak_kw, status, geom
    )
    SELECT
      id,
      parent_id,
      NULLIF(tm_id, ''),
      NULLIF(feeder_id, ''),
      NULLIF(dm_id, ''),
      NULLIF(transformer_id, ''),
      unit_path::ltree,
      unit_path_source,
      lat::double precision,
      lon::double precision,
      NULLIF(customer_type, ''),
      NULLIF(voltage, ''),
      NULLIF(phase, ''),
      contracted_power_kw::double precision,
      estimated_peak_kw::double precision,
      NULLIF(status, ''),
      ST_Force2D(geom) AS geom
    FROM staging_seed.customers;
  `);

  log('[02-insert] 6/6 customer_pii tablosu dolduruluyor...');
  await db.execute(sql`
    INSERT INTO customer.customer_pii (
      id, wiring_id, contract_id
    )
    SELECT
      id,
      wiring_id,
      contract_id
    FROM staging_seed.customer_pii;
  `);

  log('[02-insert] Staging şeması temizleniyor (DROP SCHEMA staging_seed CASCADE)...');
  await db.execute(sql`DROP SCHEMA staging_seed CASCADE;`);

  log('[02-insert] İndeksler oluşturuluyor (GiST ve B-Tree)...');
  
  // GiST İndeksleri
  await db.execute(sql`CREATE INDEX IF NOT EXISTS units_path_gist_idx ON network.units USING GIST (path);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS units_geom_gist_idx ON network.units USING GIST (geom);`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_unit_path_gist_idx ON network.components USING GIST (unit_path);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_unit_paths_gist_idx ON network.components USING GIST (unit_paths);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_geom_gist_idx ON network.components USING GIST (geom);`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS customers_unit_path_gist_idx ON customer.customers USING GIST (unit_path);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS customers_geom_gist_idx ON customer.customers USING GIST (geom);`);

  // B-Tree İndeksleri
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_type_idx ON network.components (type);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_category_idx ON network.components (category);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_breaker_role_idx ON network.components (breaker_role);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_voltage_level_idx ON network.components (voltage_level);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_topology_level_idx ON network.components (topology_level);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_parent_id_idx ON network.components (parent_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_tm_id_idx ON network.components (tm_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_feeder_id_idx ON network.components (feeder_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_dm_id_idx ON network.components (dm_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS components_transformer_id_idx ON network.components (transformer_id);`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS topology_edges_from_id_idx ON network.topology_edges (from_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS topology_edges_to_id_idx ON network.topology_edges (to_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS topology_edges_component_id_idx ON network.topology_edges (component_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS topology_edges_ring_id_idx ON network.topology_edges (ring_id);`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS customers_parent_id_idx ON customer.customers (parent_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS customers_transformer_id_idx ON customer.customers (transformer_id);`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS customer_pii_wiring_id_idx ON customer.customer_pii (wiring_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS customer_pii_contract_id_idx ON customer.customer_pii (contract_id);`);

  log('[02-insert] İndeksler ve veri aktarımı başarıyla tamamlandı.');
}
