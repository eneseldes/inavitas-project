-- Faz 10 — manevradan kurtuluş. Manevra projeden çıkarıldı; bu göç, hiçbir kod yolunun
-- okumadığı manevra yüzeyini söker:
--   rings / switching_operations   → hiç yazılmadı, hiç okunmadı
--   components.load_break          → yalnız DTO'da taşınıyordu
--   components.normally_open       → yalnız DTO'da taşınıyordu
--   components.is_closed           → anahtar pozisyonu alanıydı, yalnız DTO'da taşınıyordu
--   topology_edges.normally_open   → yalnız CSR bitine yazılıyordu, bit hiç okunmuyordu
--   topology_edges.ring_id         → restorasyon aday havuzunun anahtarıydı
--
-- 🚫 KALANLAR (manevra gibi görünür, manevraya ait değildir):
--   components.switchable          → enerjilenmede kök sınıflandırması (kesici BARRIER)
--   topology_edges.is_closed       → normalde açık tie kenarını grafın dışında tutar → radyallik
-- `topology_edges_ring_id_idx` indeksi kolonla birlikte kendiliğinden düşer.

DROP TABLE "network"."rings" CASCADE;--> statement-breakpoint
DROP TABLE "network"."switching_operations" CASCADE;--> statement-breakpoint
ALTER TABLE "network"."components" DROP COLUMN "load_break";--> statement-breakpoint
ALTER TABLE "network"."components" DROP COLUMN "normally_open";--> statement-breakpoint
ALTER TABLE "network"."components" DROP COLUMN "is_closed";--> statement-breakpoint
ALTER TABLE "network"."topology_edges" DROP COLUMN "normally_open";--> statement-breakpoint
ALTER TABLE "network"."topology_edges" DROP COLUMN "ring_id";