-- drizzle-kit `ltree`/`jsonb` operatör sınıflarını bilmediği için bu indeksler elle yazılır
-- (network-service'teki `0001_grant_app_schema_access.sql` ile aynı desen).

-- Bölge sorguları: `unit_path <@ 'TR.06.012'` — GiST olmadan tam tablo taraması olur.
CREATE INDEX IF NOT EXISTS outages_unit_path_gist_idx ON outages USING GIST (unit_path);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS outage_affected_customers_unit_path_gist_idx
  ON outage_affected_customers USING GIST (unit_path);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS network_components_ro_unit_path_gist_idx
  ON network_components_ro USING GIST (unit_path);
--> statement-breakpoint
-- Kaskad tespiti: "hangi kesintinin etki kümesi bu CBS ID'yi kapsıyor" sorgusu
-- `affected_element_ids @> '["100196"]'` biçimindedir; `jsonb_path_ops` bu tek operatör
-- için en küçük ve en hızlı indeksi verir.
CREATE INDEX IF NOT EXISTS outage_impact_elements_gin_idx
  ON outage_impact USING GIN (affected_element_ids jsonb_path_ops);
