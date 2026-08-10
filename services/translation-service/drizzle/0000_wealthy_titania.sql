CREATE TABLE "bundle_versions" (
	"locale_code" varchar(10) NOT NULL,
	"namespace_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "bundle_versions_locale_code_namespace_id_pk" PRIMARY KEY("locale_code","namespace_id")
);
--> statement-breakpoint
CREATE TABLE "locales" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" varchar(128) NOT NULL,
	"partition_key" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"actor" varchar NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key_name" varchar(256) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_namespace_key" UNIQUE("namespace_id","key_name")
);
--> statement-breakpoint
CREATE TABLE "translation_namespaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text,
	CONSTRAINT "translation_namespaces_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"locale_code" varchar(10) NOT NULL,
	"draft_value" text NOT NULL,
	"published_value" text,
	"updated_by" varchar NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_key_locale" UNIQUE("key_id","locale_code")
);
--> statement-breakpoint
ALTER TABLE "bundle_versions" ADD CONSTRAINT "bundle_versions_locale_code_locales_code_fk" FOREIGN KEY ("locale_code") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_versions" ADD CONSTRAINT "bundle_versions_namespace_id_translation_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."translation_namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_history" ADD CONSTRAINT "translation_history_translation_id_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_keys" ADD CONSTRAINT "translation_keys_namespace_id_translation_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."translation_namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_key_id_translation_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_locale_code_locales_code_fk" FOREIGN KEY ("locale_code") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_single_default_locale" ON "locales" USING btree ("is_default") WHERE "locales"."is_default";--> statement-breakpoint
CREATE INDEX "idx_translation_outbox_pending" ON "outbox" USING btree ("created_at") WHERE "outbox"."published_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_translation_history_lookup" ON "translation_history" USING btree ("translation_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_translation_keys_name" ON "translation_keys" USING btree ("key_name");--> statement-breakpoint
CREATE INDEX "idx_translations_bundle" ON "translations" USING btree ("locale_code","key_id");