-- Manevra projeden çıkarıldı (Faz 10): `network:switch` izni kalktı, etiketi de gitmeli.
--
-- 0002'deki tuzağın aynısı: seed yalnız DOKUNDUĞU anahtarı "değişti" diye işaretler;
-- `SEED_KEYS`'ten ÇIKARILAN anahtara hiç dokunmaz. Satır yerinde kalır, `user-management`
-- namespace'inin versiyonu artmaz, istemci 304 alır ve "Anahtar işletme (manevra)" etiketi
-- yayınlanan bundle'da yaşamaya devam eder. Bu yüzden hem satır silinir hem versiyon ELLE
-- artırılır.
DELETE FROM "translation_keys" WHERE "key_name" = 'permission.network.switch';--> statement-breakpoint

-- `translations` satırları `ON DELETE CASCADE` ile birlikte düştü; geriye bundle versiyonu
-- kaldı. Artırılmazsa ETag sabit kalır ve istemci silinmiş anahtarı önbellekten okumaya
-- devam eder.
UPDATE "bundle_versions" SET "version" = "version" + 1, "published_at" = now()
WHERE "namespace_id" IN (
  SELECT "id" FROM "translation_namespaces" WHERE "name" = 'user-management'
);
