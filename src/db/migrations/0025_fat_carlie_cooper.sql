CREATE TABLE "model_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"role_version" text,
	"key" text NOT NULL,
	"family" text NOT NULL,
	"sentence" text NOT NULL,
	"counts" jsonb NOT NULL,
	"workspaces" integer NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_events" ADD COLUMN "by_staff" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "role_versions" ADD COLUMN "origins" jsonb;--> statement-breakpoint
ALTER TABLE "role_versions" ADD COLUMN "measures" text[];--> statement-breakpoint
CREATE UNIQUE INDEX "model_insights_uq" ON "model_insights" USING btree ("role","key","day");--> statement-breakpoint
CREATE INDEX "model_insights_role_day_idx" ON "model_insights" USING btree ("role","day");