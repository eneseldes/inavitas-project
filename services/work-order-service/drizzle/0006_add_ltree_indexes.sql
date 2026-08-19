-- drizzle-kit `ltree` operatör sınıfını bilmediği için bu indeksler elle yazılır
-- (network-service'teki `0001_grant_app_schema_access.sql` ile aynı desen).
CREATE INDEX IF NOT EXISTS work_orders_unit_path_gist_idx ON work_orders USING GIST (unit_path);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS network_components_ro_unit_path_gist_idx
  ON network_components_ro USING GIST (unit_path);
