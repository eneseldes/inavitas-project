CREATE TABLE "work_order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"from_status" "wo_status",
	"to_status" "wo_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" varchar(64) NOT NULL,
	"origin" "record_origin" NOT NULL,
	"correlation_id" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wo_history_wo_id" ON "work_order_status_history" USING btree ("work_order_id","changed_at" DESC NULLS LAST);