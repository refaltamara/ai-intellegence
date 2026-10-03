ALTER TABLE "post_snapshots" DROP CONSTRAINT "post_snapshots_day_chk";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "sentiment_detail" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "csat" smallint;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "purchase_intent" boolean;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "translation" text;--> statement-breakpoint
ALTER TABLE "post_snapshots" ADD COLUMN "shares" integer;--> statement-breakpoint
ALTER TABLE "post_snapshots" ADD COLUMN "saves" integer;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "is_catch_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "post_snapshots" ADD CONSTRAINT "post_snapshots_day_chk" CHECK ("post_snapshots"."day_n" between 0 and 30);