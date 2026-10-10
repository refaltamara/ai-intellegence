ALTER TABLE "cases" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "brought_in_by" text DEFAULT 'panel' NOT NULL;