CREATE TABLE "cms_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"locked_until" timestamp with time zone,
	"created_by" text,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_jobs_status_chk" CHECK ("cms_jobs"."status" in ('queued','running','done','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"account_email" text,
	"kind" text NOT NULL,
	"credits" numeric(12, 2) NOT NULL,
	"ref" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ext_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"target" text NOT NULL,
	"values" jsonb NOT NULL,
	"source" text NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"creation_id" uuid,
	"maker_email" text NOT NULL,
	"approver" text,
	"estimate" jsonb,
	"progress" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ext_defs_target_chk" CHECK ("ext_defs"."target" in ('creator','post','comment')),
	CONSTRAINT "ext_defs_source_chk" CHECK ("ext_defs"."source" in ('rule','file','cemo')),
	CONSTRAINT "ext_defs_status_chk" CHECK ("ext_defs"."status" in ('draft','approved','filling','live','paused','removed'))
);
--> statement-breakpoint
CREATE TABLE "ext_values" (
	"def_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"row_ref" text NOT NULL,
	"value" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ext_values_def_id_row_ref_pk" PRIMARY KEY("def_id","row_ref")
);
--> statement-breakpoint
ALTER TABLE "creations" DROP CONSTRAINT "creations_kind_chk";--> statement-breakpoint
ALTER TABLE "cms_jobs" ADD CONSTRAINT "cms_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ext_defs" ADD CONSTRAINT "ext_defs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ext_values" ADD CONSTRAINT "ext_values_def_id_ext_defs_id_fk" FOREIGN KEY ("def_id") REFERENCES "public"."ext_defs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ext_values" ADD CONSTRAINT "ext_values_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_jobs_status_idx" ON "cms_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_ws_created_idx" ON "credit_ledger" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ext_defs_ws_key_uq" ON "ext_defs" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "ext_values_def_value_idx" ON "ext_values" USING btree ("def_id","value");--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_kind_chk" CHECK ("creations"."kind" in ('skill','deck_template','rule','fact','term','extension'));