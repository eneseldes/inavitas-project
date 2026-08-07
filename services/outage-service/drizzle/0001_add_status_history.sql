CREATE TABLE "outage_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outage_id" uuid NOT NULL,
	"from_status" "outage_status",
	"to_status" "outage_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" varchar(64) NOT NULL,
	"origin" "record_origin" NOT NULL,
	"correlation_id" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "outage_status_history" ADD CONSTRAINT "outage_status_history_outage_id_outages_id_fk" FOREIGN KEY ("outage_id") REFERENCES "public"."outages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outage_history_outage_id" ON "outage_status_history" USING btree ("outage_id","changed_at" DESC NULLS LAST);