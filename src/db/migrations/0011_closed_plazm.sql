CREATE TABLE "report_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"report_id" uuid NOT NULL,
	"format" text NOT NULL,
	"filename" text NOT NULL,
	"bytes" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_files_format_chk" CHECK ("report_files"."format" in ('pptx','pdf'))
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "kind" text DEFAULT 'analysis' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_files" ADD CONSTRAINT "report_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_files" ADD CONSTRAINT "report_files_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_files_report_idx" ON "report_files" USING btree ("report_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_kind_chk" CHECK ("agents"."kind" in ('analysis','weekly_report'));