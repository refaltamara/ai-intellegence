CREATE SCHEMA "staging";
--> statement-breakpoint
CREATE TABLE "staging"."accounts" (
	"load_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"followers_latest" integer,
	"tier_latest" text,
	"first_seen" date,
	"last_seen" date,
	CONSTRAINT "accounts_load_id_platform_handle_pk" PRIMARY KEY("load_id","platform","handle")
);
--> statement-breakpoint
CREATE TABLE "staging"."captions" (
	"load_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"caption" text NOT NULL,
	"hashtags" text[],
	CONSTRAINT "captions_load_id_platform_url_pk" PRIMARY KEY("load_id","platform","url")
);
--> statement-breakpoint
CREATE TABLE "staging"."comments" (
	"load_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"brand_id" text NOT NULL,
	"platform_comment_id" text NOT NULL,
	"author_handle" text,
	"author_hash" text,
	"text" text,
	"posted_at" timestamp with time zone,
	"likes" integer,
	"views" bigint,
	"sentiment" text,
	"sentiment_source" text,
	"sentiment_confidence" numeric,
	"sentiment_detail" text,
	"csat" smallint,
	"theme" text,
	"purchase_intent" boolean,
	"translation" text,
	"topic_id" text,
	"flags" text[],
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "staging"."loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"source" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'reading' NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_by" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staged_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"live_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "staging_loads_status_chk" CHECK ("staging"."loads"."status" in ('reading','staged','held','promoting','live','discarded','failed'))
);
--> statement-breakpoint
CREATE TABLE "staging"."posts" (
	"load_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"brand_id" text NOT NULL,
	"platform_post_id" text,
	"creator_handle" text,
	"creator_key" text,
	"source" text NOT NULL,
	"collection" text NOT NULL,
	"account_type" text,
	"posted_at" timestamp with time zone NOT NULL,
	"month" date NOT NULL,
	"caption" text,
	"hashtags" text[],
	"tagged_handles" text[],
	"is_paid" boolean,
	"has_cart" boolean,
	"is_reseller" boolean,
	"followers_at_post" integer,
	"tier" text,
	"universe" text,
	"category_broad" text,
	"product_category" text,
	"content_format" text,
	"content_type" text,
	"product_name" text,
	"product_url" text,
	"price" numeric,
	"price_original" numeric,
	"discount_percent" numeric,
	"views" bigint,
	"likes" integer,
	"comments_count" integer,
	"shares" integer,
	"saves" integer,
	"engagements" integer,
	"engagements_lc" integer,
	"captured_days" integer,
	"relevant" boolean,
	"stub" boolean DEFAULT false NOT NULL,
	"flags" text[],
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "staging"."readings" (
	"load_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"brand_id" text NOT NULL,
	"day_n" smallint NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"views" bigint,
	"likes" integer,
	"comments_count" integer,
	"shares" integer,
	"saves" integer,
	CONSTRAINT "readings_load_id_platform_url_brand_id_day_n_pk" PRIMARY KEY("load_id","platform","url","brand_id","day_n")
);
--> statement-breakpoint
CREATE TABLE "staging"."topics" (
	"load_id" uuid NOT NULL,
	"id" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_catch_all" boolean DEFAULT false NOT NULL,
	CONSTRAINT "topics_load_id_id_pk" PRIMARY KEY("load_id","id")
);
--> statement-breakpoint
ALTER TABLE "data_loads" ADD COLUMN "staging_load_id" uuid;--> statement-breakpoint
ALTER TABLE "data_loads" ADD COLUMN "raw_file_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "flags" text[];--> statement-breakpoint
ALTER TABLE "staging"."accounts" ADD CONSTRAINT "accounts_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "staging"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."captions" ADD CONSTRAINT "captions_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "staging"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."comments" ADD CONSTRAINT "comments_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "staging"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."loads" ADD CONSTRAINT "loads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."posts" ADD CONSTRAINT "posts_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "staging"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."readings" ADD CONSTRAINT "readings_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "staging"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."topics" ADD CONSTRAINT "topics_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "staging"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staging_comments_uq" ON "staging"."comments" USING btree ("load_id","platform_comment_id");--> statement-breakpoint
CREATE INDEX "staging_loads_ws_idx" ON "staging"."loads" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staging_posts_uq" ON "staging"."posts" USING btree ("load_id","platform","url","brand_id");