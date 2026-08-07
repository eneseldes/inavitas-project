CREATE TABLE "processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"topic" varchar(128) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
