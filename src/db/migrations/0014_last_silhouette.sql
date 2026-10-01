CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"source" text DEFAULT 'template' NOT NULL,
	"template" text,
	"spec" jsonb NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_period" text,
	"last_error" text,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_source_chk" CHECK ("decks"."source" in ('template','scratch','chat','pulse'))
);
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_source_chk";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "deck_id" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_workspace_idx" ON "decks" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "decks_due_idx" ON "decks" USING btree ("recurring","next_run_at");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_deck_idx" ON "reports" USING btree ("deck_id","created_at");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_chk" CHECK ("reports"."source" in ('agent','ask','deck'));