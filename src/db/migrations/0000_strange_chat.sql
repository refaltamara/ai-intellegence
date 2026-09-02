CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"skill_run_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"diff" jsonb,
	"should_deliver" boolean,
	"delivered_at" timestamp with time zone,
	"delivery_error" text,
	"report_id" uuid
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"skill" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"from_skill_run_id" uuid,
	"schedule_cron" text NOT NULL,
	"schedule_tz" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"schedule_human" text,
	"delivery" jsonb DEFAULT '{"channels":["in_app"]}'::jsonb NOT NULL,
	"only_if_changed" boolean DEFAULT true NOT NULL,
	"diff_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_status_chk" CHECK ("agents"."status" in ('active','paused','draft'))
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"is_client" boolean DEFAULT false NOT NULL,
	"tiktok_handle" text,
	"instagram_handle" text,
	"tracked_on" text NOT NULL,
	"owned_handles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"platform_comment_id" text NOT NULL,
	"author_handle" text,
	"author_hash" text,
	"text" text,
	"posted_at" timestamp with time zone,
	"likes" integer,
	"sentiment" text,
	"topic_id" text,
	"topic_confidence" numeric,
	"classified_at" timestamp with time zone,
	CONSTRAINT "comments_sentiment_chk" CHECK ("comments"."sentiment" is null or "comments"."sentiment" in ('positive','neutral','negative'))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_brand_month_import" (
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"month" date NOT NULL,
	"brand_id" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"rank" integer,
	"posts" integer,
	"views" bigint,
	"median_views" bigint,
	"engagements" bigint,
	"er_pct" numeric,
	"views_per_1k_followers" numeric,
	"cart_pct" numeric,
	"sample_url" text,
	"derived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "creator_brand_month_import_workspace_id_platform_month_brand_id_creator_id_pk" PRIMARY KEY("workspace_id","platform","month","brand_id","creator_id")
);
--> statement-breakpoint
CREATE TABLE "creator_snapshots" (
	"creator_id" uuid NOT NULL,
	"captured_at" date NOT NULL,
	"followers" integer,
	CONSTRAINT "creator_snapshots_creator_id_captured_at_pk" PRIMARY KEY("creator_id","captured_at")
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"followers_latest" integer,
	"tier_latest" text,
	"location" text,
	"first_seen" date,
	"last_seen" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_platform_chk" CHECK ("creators"."platform" in ('tiktok','instagram','threads','x'))
);
--> statement-breakpoint
CREATE TABLE "data_loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"file" text NOT NULL,
	"platform" text,
	"kind" text NOT NULL,
	"rows_in" integer DEFAULT 0 NOT NULL,
	"rows_loaded" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"evidence_json" jsonb,
	"skill_run_ids" uuid[],
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_snapshots" (
	"post_id" uuid NOT NULL,
	"day_n" smallint NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"views" bigint,
	"likes" integer,
	"comments_count" integer,
	CONSTRAINT "post_snapshots_post_id_day_n_pk" PRIMARY KEY("post_id","day_n"),
	CONSTRAINT "post_snapshots_day_chk" CHECK ("post_snapshots"."day_n" between 0 and 7)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"platform_post_id" text,
	"creator_id" uuid,
	"creator_handle" text,
	"brand_id" text NOT NULL,
	"source" text NOT NULL,
	"collection" text NOT NULL,
	"account_type" text,
	"posted_at" timestamp with time zone NOT NULL,
	"month" date NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"hashtags" text[],
	"is_paid" boolean,
	"has_cart" boolean,
	"is_reseller" boolean DEFAULT false NOT NULL,
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
	"source_file" text,
	"load_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_platform_chk" CHECK ("posts"."platform" in ('tiktok','instagram','threads','x')),
	CONSTRAINT "posts_source_chk" CHECK ("posts"."source" in ('owned','earned')),
	CONSTRAINT "posts_tier_chk" CHECK ("posts"."tier" is null or "posts"."tier" in ('nano','micro','mid','macro','mega'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"skill_run_id" uuid,
	"agent_run_id" uuid,
	"body_md" text,
	"blocks" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_source_chk" CHECK ("reports"."source" in ('agent','ask'))
);
--> statement-breakpoint
CREATE TABLE "skill_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"skill" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"params_resolved" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"status" text NOT NULL,
	"actor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agent_run_id" uuid,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"label" text NOT NULL,
	"parent_id" text,
	"kind" text DEFAULT 'general' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"whatsapp_e164" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"client_brand_id" text,
	"tz" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_skill_run_id_skill_runs_id_fk" FOREIGN KEY ("skill_run_id") REFERENCES "public"."skill_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_brand_month_import" ADD CONSTRAINT "creator_brand_month_import_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_brand_month_import" ADD CONSTRAINT "creator_brand_month_import_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_brand_month_import" ADD CONSTRAINT "creator_brand_month_import_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_snapshots" ADD CONSTRAINT "creator_snapshots_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_loads" ADD CONSTRAINT "data_loads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_snapshots" ADD CONSTRAINT "post_snapshots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_skill_run_id_skill_runs_id_fk" FOREIGN KEY ("skill_run_id") REFERENCES "public"."skill_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_runs" ADD CONSTRAINT "skill_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_agent_started_idx" ON "agent_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "agents_workspace_status_idx" ON "agents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "brands_workspace_idx" ON "brands" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comments_workspace_platform_comment_uq" ON "comments" USING btree ("workspace_id","platform_comment_id");--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_workspace_platform_handle_uq" ON "creators" USING btree ("workspace_id","platform","handle");--> statement-breakpoint
CREATE INDEX "data_loads_workspace_started_idx" ON "data_loads" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_workspace_platform_url_brand_uq" ON "posts" USING btree ("workspace_id","platform","url","brand_id");--> statement-breakpoint
CREATE INDEX "posts_workspace_brand_posted_idx" ON "posts" USING btree ("workspace_id","brand_id","posted_at");--> statement-breakpoint
CREATE INDEX "posts_creator_posted_idx" ON "posts" USING btree ("creator_id","posted_at");--> statement-breakpoint
CREATE INDEX "posts_month_platform_idx" ON "posts" USING btree ("month","platform");--> statement-breakpoint
CREATE INDEX "posts_workspace_platform_posted_idx" ON "posts" USING btree ("workspace_id","platform","posted_at");--> statement-breakpoint
CREATE INDEX "posts_hashtags_gin" ON "posts" USING gin ("hashtags");--> statement-breakpoint
CREATE INDEX "reports_workspace_created_idx" ON "reports" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_runs_workspace_created_idx" ON "skill_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_workspace_email_uq" ON "users" USING btree ("workspace_id","email");