CREATE SCHEMA "customer";
--> statement-breakpoint
CREATE SCHEMA "network";
--> statement-breakpoint
CREATE TABLE "network"."components" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"category" varchar(64) NOT NULL,
	"breaker_role" varchar(64),
	"voltage_level" varchar(32) NOT NULL,
	"topology_level" integer NOT NULL,
	"parent_id" varchar(64),
	"tm_id" varchar(64),
	"feeder_id" varchar(64),
	"dm_id" varchar(64),
	"transformer_id" varchar(64),
	"unit_path" "ltree" NOT NULL,
	"unit_paths" "ltree"[],
	"unit_path_source" varchar(32) NOT NULL,
	"geom" geometry,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"switchable" boolean DEFAULT false NOT NULL,
	"load_break" boolean DEFAULT false NOT NULL,
	"normally_open" boolean DEFAULT false NOT NULL,
	"is_closed" boolean DEFAULT true NOT NULL,
	"status" varchar(32) NOT NULL,
	"is_energized" boolean DEFAULT true NOT NULL,
	"name" varchar(255),
	"attributes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer"."customer_pii" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"wiring_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer"."customers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"parent_id" varchar(64) NOT NULL,
	"tm_id" varchar(64),
	"feeder_id" varchar(64),
	"dm_id" varchar(64),
	"transformer_id" varchar(64),
	"unit_path" "ltree" NOT NULL,
	"unit_path_source" varchar(32) NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"customer_type" varchar(64),
	"voltage" varchar(32),
	"phase" varchar(16),
	"contracted_power_kw" double precision,
	"estimated_peak_kw" double precision,
	"status" varchar(32),
	"geom" geometry
);
--> statement-breakpoint
CREATE TABLE "network"."rings" (
	"ring_id" varchar(64) PRIMARY KEY NOT NULL,
	"ring_type" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"tm_id" varchar(64),
	"tie_switch_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "network"."switching_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" varchar(64) NOT NULL,
	"action" varchar(32) NOT NULL,
	"performed_by" varchar(255) NOT NULL,
	"performed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network"."topology_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" varchar(64) NOT NULL,
	"to_id" varchar(64) NOT NULL,
	"connection_type" varchar(64) NOT NULL,
	"is_closed" boolean DEFAULT true NOT NULL,
	"normally_open" boolean DEFAULT false NOT NULL,
	"ring_id" varchar(64),
	"participates_in_outage_graph" boolean DEFAULT true NOT NULL,
	"component_id" varchar(64),
	"length_m" double precision
);
--> statement-breakpoint
CREATE TABLE "network"."units" (
	"path" "ltree" PRIMARY KEY NOT NULL,
	"parent_path" "ltree",
	"level" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"province_name" varchar(255) NOT NULL,
	"district_name" varchar(255),
	"external_ref" varchar(64),
	"center_lat" double precision,
	"center_lon" double precision,
	"geom" geometry,
	"geom_simplified" geometry,
	"centroid" geometry,
	"bbox" geometry,
	"hamlets" jsonb
);
