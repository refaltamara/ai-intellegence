ALTER TABLE "workspaces" ADD COLUMN "kind" text DEFAULT 'category' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;