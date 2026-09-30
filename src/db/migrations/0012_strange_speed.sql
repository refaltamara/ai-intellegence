CREATE TABLE "pulse_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"pulse_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"size" text DEFAULT 'm' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"skill_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pulse_cards_kind_chk" CHECK ("pulse_cards"."kind" in ('kpi','rankings','trend','tiers','creators','content','skill')),
	CONSTRAINT "pulse_cards_size_chk" CHECK ("pulse_cards"."size" in ('s','m','l'))
);
--> statement-breakpoint
CREATE TABLE "pulses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pulse_cards" ADD CONSTRAINT "pulse_cards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_cards" ADD CONSTRAINT "pulse_cards_pulse_id_pulses_id_fk" FOREIGN KEY ("pulse_id") REFERENCES "public"."pulses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_cards" ADD CONSTRAINT "pulse_cards_skill_run_id_skill_runs_id_fk" FOREIGN KEY ("skill_run_id") REFERENCES "public"."skill_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulses" ADD CONSTRAINT "pulses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulses" ADD CONSTRAINT "pulses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pulse_cards_pulse_idx" ON "pulse_cards" USING btree ("pulse_id","position");--> statement-breakpoint
CREATE INDEX "pulses_workspace_idx" ON "pulses" USING btree ("workspace_id","updated_at");