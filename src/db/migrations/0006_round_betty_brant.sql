CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"skill_run_id" uuid NOT NULL,
	"user_id" uuid,
	"format" text NOT NULL,
	"rows" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_runs" ADD COLUMN "pane_state" jsonb;--> statement-breakpoint
ALTER TABLE "skill_runs" ADD COLUMN "pane_title" text;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_skill_run_id_skill_runs_id_fk" FOREIGN KEY ("skill_run_id") REFERENCES "public"."skill_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_run_idx" ON "exports" USING btree ("skill_run_id","created_at");