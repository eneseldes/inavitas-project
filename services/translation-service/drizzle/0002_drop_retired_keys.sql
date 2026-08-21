-- Seed'den çıkarılan anahtarları sözlükten de siler.
--
-- Seed yalnız DOKUNDUĞU anahtarı "değişti" diye işaretler; `SEED_KEYS`'ten ÇIKARILAN anahtara
-- hiç dokunmaz. Satırlar yerinde kalır, namespace'in versiyonu artmaz, istemci 304 alır ve
-- kaldırılmış metin yayınlanan bundle'da yaşamaya devam eder. Bu yüzden hem satırlar
-- silinir hem versiyon ELLE artırılır.
--
-- Silinenler:
--   map.confirm.highImpact*        → yüksek etkili kesinti izni kaldırıldı (Faz 9.1b)
--   user-management.role.module.generic / .user → modül grupları artık izne ait bir alandan
--                                  geliyor; jenerik kutu ve `user` modülü kalktı (9.1a/9.1c)
--   user-management.validation.rolesRequired    → yerini `assignmentsRequired` aldı (9.3b)
DELETE FROM "translation_keys" WHERE "key_name" IN (
  'map.confirm.highImpactWarning',
  'map.confirm.highImpactForbidden',
  'map.confirm.highImpactWorkOrderNote',
  'user-management.role.module.generic',
  'user-management.role.module.user',
  'user-management.validation.rolesRequired'
);--> statement-breakpoint

-- `translations` satırları `ON DELETE CASCADE` ile birlikte düştü; geriye bundle versiyonu
-- kaldı. Artırılmazsa ETag sabit kalır ve istemci silinmiş anahtarları önbellekten okumaya
-- devam eder.
UPDATE "bundle_versions" SET "version" = "version" + 1, "published_at" = now()
WHERE "namespace_id" IN (
  SELECT "id" FROM "translation_namespaces" WHERE "name" IN ('map', 'user-management')
);
