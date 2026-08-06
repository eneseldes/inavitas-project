CREATE TYPE "public"."record_origin" AS ENUM('USER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."wo_status" AS ENUM('STARTED', 'ASSIGNED', 'IN_PROGRESS', 'ENERGIZED', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."wo_type" AS ENUM('BASIC_WORK', 'LIGHTING_WORK_ORDER', 'PLANNED_OUTAGE_WORK_ORDER', 'UNPLANNED_OUTAGE_WORK_ORDER', 'WITHOUT_OUTAGE_WORK_ORDER');--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "wo_status" DEFAULT 'STARTED' NOT NULL,
	"type" "wo_type" NOT NULL,
	"gis_id" varchar(64) NOT NULL,
	"outage_id" uuid,
	"origin" "record_origin" DEFAULT 'USER' NOT NULL,
	"created_by" varchar(64) NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_wo_created_at" ON "work_orders" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_wo_status" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wo_gis_id" ON "work_orders" USING btree ("gis_id");--> statement-breakpoint
CREATE INDEX "idx_wo_outage" ON "work_orders" USING btree ("outage_id") WHERE "work_orders"."outage_id" IS NOT NULL;