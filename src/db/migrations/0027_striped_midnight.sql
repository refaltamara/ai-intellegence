CREATE TABLE "slide_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"deck_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"slide" integer NOT NULL,
	"author" text DEFAULT 'person' NOT NULL,
	"author_email" text,
	"author_name" text,
	"text" text NOT NULL,
	"proposal" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slide_comments_author_chk" CHECK ("slide_comments"."author" in ('person','cemo'))
);
--> statement-breakpoint
ALTER TABLE "slide_comments" ADD CONSTRAINT "slide_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_comments" ADD CONSTRAINT "slide_comments_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_comments" ADD CONSTRAINT "slide_comments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slide_comments_report_idx" ON "slide_comments" USING btree ("report_id","slide");