CREATE TABLE "creations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"key" text,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"maker_user_id" uuid,
	"maker_email" text NOT NULL,
	"maker_name" text,
	"approver" text,
	"note" text,
	"decided_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creations_kind_chk" CHECK ("creations"."kind" in ('skill','deck_template','rule','fact','term')),
	CONSTRAINT "creations_status_chk" CHECK ("creations"."status" in ('draft','waiting','approved','sent_back','rejected','removed'))
);
--> statement-breakpoint
CREATE TABLE "fair_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text NOT NULL,
	"ref_kind" text NOT NULL,
	"ref" text NOT NULL,
	"value" jsonb,
	"note" text,
	"by_email" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"fair_note" text,
	"fair_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fair_suggestions_ref_chk" CHECK ("fair_suggestions"."ref_kind" in ('creation','setting')),
	CONSTRAINT "fair_suggestions_status_chk" CHECK ("fair_suggestions"."status" in ('new','seen','adopted','declined'))
);
--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fair_suggestions" ADD CONSTRAINT "fair_suggestions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creations_ws_role_idx" ON "creations" USING btree ("workspace_id","role","status");--> statement-breakpoint
CREATE INDEX "fair_suggestions_status_idx" ON "fair_suggestions" USING btree ("status","created_at");