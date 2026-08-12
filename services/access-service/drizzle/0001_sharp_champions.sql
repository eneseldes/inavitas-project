ALTER TABLE "permissions" ADD COLUMN "description" varchar(128);--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;