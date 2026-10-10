-- Data architecture V1, step 3 (DECISIONS, 10 Oct 2026, "One row per real thing"): one row per real post (post_items),
-- with posts as its links to brands. This migration only adds the tables and columns. `pnpm load backfill-items` then folds
-- each post's brand rows into its item and links them (src/loader/backfillItems.ts), and migration 0036 makes the link
-- required, indexes it and adds the triggers that keep a post and its links in step. posts.item_id gets its index and
-- foreign key in 0036, after the backfill, so the backfill's update leaves posts' indexes alone.
CREATE TABLE "post_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"platform_post_id" text,
	"creator_id" uuid,
	"creator_handle" text,
	"posted_at" timestamp with time zone NOT NULL,
	"month" date NOT NULL,
	"caption" text,
	"hashtags" text[],
	"tagged_handles" text[],
	"is_paid" boolean,
	"followers_at_post" integer,
	"tier" text,
	"content_format" text,
	"content_type" text,
	"views" bigint,
	"likes" integer,
	"comments_count" integer,
	"shares" integer,
	"saves" integer,
	"engagements" integer,
	"engagements_lc" integer,
	"captured_days" integer,
	"stance" text,
	"stance_source" text,
	"topic_id" text,
	"topic_confidence" numeric,
	"voice" text,
	"cap_product" text,
	"cap_event" text,
	"cap_event_name" text,
	"cap_offer" text,
	"cap_hook" text,
	"cap_angle" text,
	"cap_source" text,
	"cap_read_at" timestamp with time zone,
	"flags" text[],
	"read_at" timestamp with time zone,
	"source_file" text,
	"load_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "match" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "term" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "checked_by" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "brought_in_by" text DEFAULT 'panel' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_items" ADD CONSTRAINT "post_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_items" ADD CONSTRAINT "post_items_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_items_workspace_platform_url_uq" ON "post_items" USING btree ("workspace_id","platform","url");--> statement-breakpoint
CREATE INDEX "post_items_workspace_posted_idx" ON "post_items" USING btree ("workspace_id","posted_at");
