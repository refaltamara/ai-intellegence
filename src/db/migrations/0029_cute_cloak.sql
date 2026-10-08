CREATE INDEX "posts_not_relevant_idx" ON "posts" USING btree ("id") WHERE "posts"."relevant" = false;--> statement-breakpoint
-- Re-read table statistics after 2% of rows change, not the default 10%: a new workspace of a few thousand
-- posts in a table of 300K otherwise stays unknown to the planner, which then picks plans that take minutes.
ALTER TABLE "posts" SET (autovacuum_analyze_scale_factor = 0.02, autovacuum_analyze_threshold = 1000);--> statement-breakpoint
ALTER TABLE "comments" SET (autovacuum_analyze_scale_factor = 0.02, autovacuum_analyze_threshold = 1000);
