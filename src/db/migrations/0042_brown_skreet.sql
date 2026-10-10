ALTER TABLE "comments" DROP COLUMN "sentiment_detail";--> statement-breakpoint
ALTER TABLE "comments" DROP COLUMN "csat";--> statement-breakpoint
ALTER TABLE "staging"."comments" DROP COLUMN "sentiment_detail";--> statement-breakpoint
ALTER TABLE "staging"."comments" DROP COLUMN "csat";--> statement-breakpoint
-- Refal, 10 Oct 2026: nothing reads mv_brand_week since brand pages moved to the daily totals (step 4, seventh part)
DROP MATERIALIZED VIEW IF EXISTS "mv_brand_week";--> statement-breakpoint
-- Refal, 10 Oct 2026: the old snapshots table kept at step 3; post_snapshots (a view of the readings) returns its rows
DROP TABLE IF EXISTS "post_snapshots_before_10_oct";
