CREATE TABLE "network"."outage_states_ro" (
	"outage_id" uuid PRIMARY KEY NOT NULL,
	"cbs_id" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_outage_states_ro_cbs" ON "network"."outage_states_ro" USING btree ("cbs_id");--> statement-breakpoint
CREATE INDEX "idx_outage_states_ro_active" ON "network"."outage_states_ro" USING btree ("cbs_id") WHERE "network"."outage_states_ro"."status" = 'STARTED';