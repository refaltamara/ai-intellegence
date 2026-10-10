CREATE TABLE "daily_creators" (
	"workspace_id" text NOT NULL,
	"day" date NOT NULL,
	"brand_id" text NOT NULL,
	"platform" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"posts" integer NOT NULL,
	"cart_posts" integer NOT NULL,
	"views" bigint NOT NULL,
	"d7_views" bigint NOT NULL,
	"engagement_lc" bigint NOT NULL,
	"followers" integer,
	"definitions" text NOT NULL,
	CONSTRAINT "daily_creators_workspace_id_day_brand_id_platform_creator_id_pk" PRIMARY KEY("workspace_id","day","brand_id","platform","creator_id")
);
--> statement-breakpoint
CREATE TABLE "daily_totals" (
	"workspace_id" text NOT NULL,
	"day" date NOT NULL,
	"brand_id" text NOT NULL,
	"platform" text NOT NULL,
	"source" text NOT NULL,
	"posts" integer NOT NULL,
	"flagged" integer NOT NULL,
	"cart_posts" integer NOT NULL,
	"views" bigint NOT NULL,
	"engagement" bigint NOT NULL,
	"engagement_lc" bigint NOT NULL,
	"comments" bigint NOT NULL,
	"rated_posts" integer NOT NULL,
	"rated_views" bigint NOT NULL,
	"rated_engagement" bigint NOT NULL,
	"rated_lc_posts" integer NOT NULL,
	"rated_lc_views" bigint NOT NULL,
	"rated_lc_engagement" bigint NOT NULL,
	"d7_posts" integer NOT NULL,
	"d7_views" bigint NOT NULL,
	"d7_engagement" bigint NOT NULL,
	"d7_engagement_lc" bigint NOT NULL,
	"d7_rated_posts" integer NOT NULL,
	"d7_rated_views" bigint NOT NULL,
	"d7_rated_engagement" bigint NOT NULL,
	"d7_rated_lc_posts" integer NOT NULL,
	"d7_rated_lc_views" bigint NOT NULL,
	"d7_rated_lc_engagement" bigint NOT NULL,
	"definitions" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_totals_workspace_id_day_brand_id_platform_source_pk" PRIMARY KEY("workspace_id","day","brand_id","platform","source")
);
--> statement-breakpoint
CREATE TABLE "post_d7" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"day_n" smallint,
	"read_at" timestamp with time zone,
	"views" bigint,
	"likes" integer,
	"comments_count" integer,
	"shares" integer,
	"saves" integer
);
--> statement-breakpoint
ALTER TABLE "daily_creators" ADD CONSTRAINT "daily_creators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_totals" ADD CONSTRAINT "daily_totals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_d7" ADD CONSTRAINT "post_d7_item_id_post_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."post_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_d7" ADD CONSTRAINT "post_d7_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_creators_creator_idx" ON "daily_creators" USING btree ("workspace_id","creator_id","day");--> statement-breakpoint
CREATE INDEX "daily_totals_brand_idx" ON "daily_totals" USING btree ("workspace_id","brand_id","day");--> statement-breakpoint
CREATE INDEX "post_d7_workspace_idx" ON "post_d7" USING btree ("workspace_id");