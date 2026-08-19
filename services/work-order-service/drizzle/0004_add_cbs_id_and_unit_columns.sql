CREATE TABLE "network_components_ro" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"category" varchar(64) NOT NULL,
	"breaker_role" varchar(64),
	"name" varchar(255),
	"voltage_level" varchar(32) NOT NULL,
	"topology_level" integer NOT NULL,
	"unit_path" "ltree" NOT NULL,
	"unit_name" varchar(255),
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_orders" ALTER COLUMN "gis_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "cbs_id" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "unit_path" "ltree" NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "unit_name" varchar(255);--> statement-breakpoint
CREATE INDEX "idx_components_ro_type" ON "network_components_ro" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_wo_cbs_id" ON "work_orders" USING btree ("cbs_id");--> statement-breakpoint
CREATE INDEX "idx_wo_type" ON "work_orders" USING btree ("type");