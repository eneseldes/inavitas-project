CREATE TYPE "public"."outage_impact_status" AS ENUM('PENDING', 'CALCULATED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."outage_kind" AS ENUM('PLANNED', 'UNPLANNED');--> statement-breakpoint
CREATE TYPE "public"."outage_relation_type" AS ENUM('CONTAINS', 'SUPERSEDES');--> statement-breakpoint
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
CREATE TABLE "outage_affected_customers" (
	"outage_id" uuid NOT NULL,
	"customer_id" varchar(64) NOT NULL,
	"unit_path" "ltree" NOT NULL,
	"customer_type" varchar(64),
	CONSTRAINT "outage_affected_customers_outage_id_customer_id_pk" PRIMARY KEY("outage_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "outage_impact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outage_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"affected_element_count" integer NOT NULL,
	"affected_customer_count" integer NOT NULL,
	"affected_element_ids" jsonb NOT NULL,
	"overflowed" boolean DEFAULT false NOT NULL,
	"radiality_violated" boolean DEFAULT false NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_outage_impact_revision" UNIQUE("outage_id","revision")
);
--> statement-breakpoint
CREATE TABLE "outage_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_outage_id" uuid NOT NULL,
	"child_outage_id" uuid NOT NULL,
	"relation_type" "outage_relation_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_outage_relation" UNIQUE("parent_outage_id","child_outage_id"),
	CONSTRAINT "chk_relation_not_self" CHECK ("outage_relations"."parent_outage_id" <> "outage_relations"."child_outage_id")
);
--> statement-breakpoint
DROP INDEX "idx_outages_active";--> statement-breakpoint
ALTER TABLE "outages" ALTER COLUMN "gis_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "kind" "outage_kind" DEFAULT 'UNPLANNED' NOT NULL;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "cbs_id" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "unit_path" "ltree" NOT NULL;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "component_type" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "component_name" varchar(255);--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "topology_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "affected_customer_count" integer;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "impact_status" "outage_impact_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "outages" ADD COLUMN "parent_outage_id" uuid;--> statement-breakpoint
ALTER TABLE "outage_affected_customers" ADD CONSTRAINT "outage_affected_customers_outage_id_outages_id_fk" FOREIGN KEY ("outage_id") REFERENCES "public"."outages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outage_impact" ADD CONSTRAINT "outage_impact_outage_id_outages_id_fk" FOREIGN KEY ("outage_id") REFERENCES "public"."outages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outage_relations" ADD CONSTRAINT "outage_relations_parent_outage_id_outages_id_fk" FOREIGN KEY ("parent_outage_id") REFERENCES "public"."outages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outage_relations" ADD CONSTRAINT "outage_relations_child_outage_id_outages_id_fk" FOREIGN KEY ("child_outage_id") REFERENCES "public"."outages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_components_ro_type" ON "network_components_ro" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_outage_impact_outage" ON "outage_impact" USING btree ("outage_id","revision" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_outage_relations_child" ON "outage_relations" USING btree ("child_outage_id");--> statement-breakpoint
ALTER TABLE "outages" ADD CONSTRAINT "outages_parent_outage_id_outages_id_fk" FOREIGN KEY ("parent_outage_id") REFERENCES "public"."outages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outages_cbs_id" ON "outages" USING btree ("cbs_id");--> statement-breakpoint
CREATE INDEX "idx_outages_component_type" ON "outages" USING btree ("component_type");--> statement-breakpoint
CREATE INDEX "idx_outages_parent" ON "outages" USING btree ("parent_outage_id") WHERE "outages"."parent_outage_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_outages_active" ON "outages" USING btree ("cbs_id","started_at" DESC NULLS LAST) WHERE "outages"."status" = 'STARTED';--> statement-breakpoint
ALTER TABLE "outages" ADD CONSTRAINT "chk_parent_not_self" CHECK ("outages"."parent_outage_id" IS NULL OR "outages"."parent_outage_id" <> "outages"."id");