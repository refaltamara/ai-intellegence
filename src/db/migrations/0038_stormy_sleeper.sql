ALTER TABLE "daily_totals" ADD COLUMN "so_far_posts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "post_d7" ADD COLUMN "so_far" boolean DEFAULT false NOT NULL;