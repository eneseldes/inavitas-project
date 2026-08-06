CREATE TYPE "public"."outage_status" AS ENUM('STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."record_origin" AS ENUM('USER', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "outages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" "outage_status" DEFAULT 'STARTED' NOT NULL,
	"work_order_id" uuid,
	"gis_id" varchar(64) NOT NULL,
	"origin" "record_origin" DEFAULT 'USER' NOT NULL,
	"created_by" varchar(64) NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chk_ended_after_started" CHECK ("outages"."ended_at" IS NULL OR "outages"."ended_at" >= "outages"."started_at")
);
--> statement-breakpoint
CREATE INDEX "idx_outages_created_at" ON "outages" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_outages_status" ON "outages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_outages_gis_id" ON "outages" USING btree ("gis_id");--> statement-breakpoint
CREATE INDEX "idx_outages_work_order" ON "outages" USING btree ("work_order_id") WHERE "outages"."work_order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_outages_active" ON "outages" USING btree ("gis_id","started_at" DESC NULLS LAST) WHERE "outages"."status" = 'STARTED';