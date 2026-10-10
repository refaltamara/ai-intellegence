CREATE TABLE "post_readings" (
	"post_id" uuid NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"age_hours" integer,
	"day_n" smallint NOT NULL,
	"source" text NOT NULL,
	"views" bigint,
	"likes" integer,
	"comments_count" integer,
	"shares" integer,
	"saves" integer,
	"load_id" uuid,
	CONSTRAINT "post_readings_post_id_read_at_day_n_pk" PRIMARY KEY("post_id","read_at","day_n")
) PARTITION BY RANGE ("read_at");
--> statement-breakpoint
-- split by month of reading from the start (DECISIONS, 10 Oct 2026): Oct 2025 to Dec 2027, and a default for anything else
DO $$
DECLARE m date := date '2025-10-01';
BEGIN
  WHILE m < date '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF post_readings FOR VALUES FROM (%L) TO (%L)', 'post_readings_' || to_char(m, 'YYYY_MM'), m, (m + interval '1 month')::date);
    m := (m + interval '1 month')::date;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_readings_default" PARTITION OF "post_readings" DEFAULT;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staging"."posts" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_readings" ADD CONSTRAINT "post_readings_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_readings_post_day_idx" ON "post_readings" USING btree ("post_id","day_n");--> statement-breakpoint
-- the dump readings so far: kept with their time and the post's age then
INSERT INTO "post_readings" ("post_id", "read_at", "age_hours", "day_n", "source", "views", "likes", "comments_count", "shares", "saves")
SELECT s.post_id, s.captured_at, round(extract(epoch from (s.captured_at - p.posted_at)) / 3600)::int, s.day_n, 'listening', s.views, s.likes, s.comments_count, s.shares, s.saves
  FROM "post_snapshots" s JOIN "posts" p ON p.id = s.post_id;
