CREATE TABLE "lab_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"draft_version" text NOT NULL,
	"owner" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'fair' NOT NULL,
	"workspace_id" text,
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"spec" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_status_chk" CHECK ("recipes"."status" in ('active','retired'))
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"spec" jsonb NOT NULL,
	"source" text DEFAULT 'fair' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_cases_kind_chk" CHECK ("test_cases"."kind" in ('guard','screen','question'))
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch" uuid NOT NULL,
	"role" text NOT NULL,
	"role_version" text NOT NULL,
	"case_key" text NOT NULL,
	"workspace_id" text,
	"status" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_versions" ADD COLUMN "stage_workspaces" text[];--> statement-breakpoint
ALTER TABLE "role_versions" ADD COLUMN "test_summary" jsonb;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_sessions_role_idx" ON "lab_sessions" USING btree ("role","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_scope_key_version_uq" ON "recipes" USING btree ("scope","key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "test_cases_role_key_uq" ON "test_cases" USING btree ("role","key");--> statement-breakpoint
CREATE INDEX "test_runs_role_version_idx" ON "test_runs" USING btree ("role","role_version","created_at");--> statement-breakpoint
CREATE INDEX "test_runs_batch_idx" ON "test_runs" USING btree ("batch");