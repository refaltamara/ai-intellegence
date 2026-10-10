-- post_snapshots becomes a view of the readings (DECISIONS, 10 Oct 2026): the table is kept, renamed, with the readings it held
ALTER TABLE "post_snapshots" RENAME TO "post_snapshots_before_10_oct";
--> statement-breakpoint
-- one row per post and day index, the latest reading of it: what the code that reads post_snapshots always saw
CREATE VIEW "post_snapshots" AS
SELECT DISTINCT ON (r.post_id, r.day_n) r.post_id, r.day_n, r.read_at AS captured_at, r.views, r.likes, r.comments_count, r.shares, r.saves
  FROM "post_readings" r
 WHERE r.source = 'listening'
 ORDER BY r.post_id, r.day_n, r.read_at DESC;
