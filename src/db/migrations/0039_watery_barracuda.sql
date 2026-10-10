CREATE TABLE "case_posts" (
	"case_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"load_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_posts_case_id_item_id_pk" PRIMARY KEY("case_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"about" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"terms" text[] DEFAULT '{}'::text[] NOT NULL,
	"platforms" text[],
	"pace" text DEFAULT 'daily' NOT NULL,
	"scraper_request" text,
	"access" text[] NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_access_chk" CHECK (cardinality("cases"."access") > 0),
	CONSTRAINT "cases_pace_chk" CHECK ("cases"."pace" in ('daily','hourly')),
	CONSTRAINT "cases_status_chk" CHECK ("cases"."status" in ('open','closed'))
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "case_posts" ADD CONSTRAINT "case_posts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_posts" ADD CONSTRAINT "case_posts_item_id_post_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."post_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_posts" ADD CONSTRAINT "case_posts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_posts_item_idx" ON "case_posts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "cases_workspace_idx" ON "cases" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;