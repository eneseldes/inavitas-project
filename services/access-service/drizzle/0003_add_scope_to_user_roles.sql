-- Kapsamlı yetki modeli: rol ataması `(user_id, role_id)` ikilisinden
-- `(user_id, role_id, unit_path)` üçlüsüne genişler. Sıra önemli — kolon önce nullable
-- eklenir, kök kapsamla doldurulur, sonra NOT NULL yapılır: göç sırasında kimse yetkisini
-- kaybetmemeli.
CREATE EXTENSION IF NOT EXISTS ltree;
--> statement-breakpoint
CREATE TABLE "units_ro" (
	"path" "ltree" PRIMARY KEY NOT NULL,
	"parent_path" "ltree",
	"level" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"province_name" varchar(255) NOT NULL,
	"district_name" varchar(255),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_units_ro_parent" ON "units_ro" USING btree ("parent_path");--> statement-breakpoint
CREATE INDEX "idx_units_ro_name" ON "units_ro" USING btree ("name");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scope_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint

-- İzin modülü: gruplama artık izin kodunun önekinden türetilmiyor, izne ait bir alan.
-- Mevcut satırlar geçici olarak önekten doldurulur; seed hemen ardından
-- `PERMISSION_MODULES`'un doğru değerini yazar (abone izinleri şebeke modülüne taşınır).
ALTER TABLE "permissions" ADD COLUMN "module" varchar(32);--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "permissions" SET "module" = split_part("code", ':', 1) WHERE "module" IS NULL;--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "module" SET NOT NULL;--> statement-breakpoint

-- Yüksek etkili kesinti izni kaldırıldı: kesinti açma yetkisi tektir (`outage:write`).
-- Yalnız koddan silmek yetmez — seed upsert yaptığı için satır yerinde kalır, rol panelinde
-- hayalet bir satır olarak görünür ve role atanmış hâldeyse JWT'ye girmeye devam ederdi.
DELETE FROM "role_permissions" WHERE "permission_id" IN (
  SELECT "id" FROM "permissions" WHERE "code" = 'outage:write-high-impact'
);--> statement-breakpoint
DELETE FROM "permissions" WHERE "code" = 'outage:write-high-impact';--> statement-breakpoint

ALTER TABLE "user_roles" ADD COLUMN "unit_path" "ltree";--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "user_roles" SET "unit_path" = 'TR.06'::ltree WHERE "unit_path" IS NULL;--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "unit_path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_role_id_pk";--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_role_id_unit_path_pk" PRIMARY KEY("user_id","role_id","unit_path");--> statement-breakpoint

-- drizzle-kit ltree operatör sınıflarını bilmediği için GiST indeksi elle yazılır
-- (network-service ve outage-service'teki aynı desen).
CREATE INDEX IF NOT EXISTS user_roles_unit_path_gist_idx ON "user_roles" USING GIST ("unit_path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS units_ro_path_gist_idx ON "units_ro" USING GIST ("path");
