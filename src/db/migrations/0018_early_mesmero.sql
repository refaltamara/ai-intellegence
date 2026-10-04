CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"actor" text NOT NULL,
	"area" text NOT NULL,
	"action" text NOT NULL,
	"path" text,
	"old" jsonb,
	"new" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text NOT NULL,
	"version" integer NOT NULL,
	"base_version" text,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cache_read" integer DEFAULT 0 NOT NULL,
	"cache_write" integer DEFAULT 0 NOT NULL,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text NOT NULL,
	"user_id" uuid,
	"role_version" text,
	"company_version" integer,
	"surface" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_settings" (
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_settings_workspace_id_user_id_role_pk" PRIMARY KEY("workspace_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "role_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"codename" text NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"spec" jsonb NOT NULL,
	"release_note" text,
	"min_app_version" text,
	"proposed_by" text,
	"released_by" text,
	"released_at" timestamp with time zone,
	"rolled_back_by" text,
	"rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_versions_status_chk" CHECK ("role_versions"."status" in ('draft','proposed','released','rolled_back'))
);
--> statement-breakpoint
ALTER TABLE "company_versions" ADD CONSTRAINT "company_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_settings" ADD CONSTRAINT "personal_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_settings" ADD CONSTRAINT "personal_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_ws_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_area_idx" ON "audit_log" USING btree ("area","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_versions_uq" ON "company_versions" USING btree ("workspace_id","role","version");--> statement-breakpoint
CREATE INDEX "model_calls_ws_created_idx" ON "model_calls" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_purpose_idx" ON "model_calls" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "model_events_ws_created_idx" ON "model_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "model_events_role_kind_idx" ON "model_events" USING btree ("role","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_versions_role_version_uq" ON "role_versions" USING btree ("role","version");--> statement-breakpoint
CREATE INDEX "role_versions_current_idx" ON "role_versions" USING btree ("role","status","released_at");