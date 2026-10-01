ALTER TABLE "posts" ADD COLUMN "cap_product" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cap_event" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cap_event_name" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cap_offer" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cap_hook" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cap_angle" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cap_source" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cap_read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "posts_cap_pick_idx" ON "posts" USING btree ("workspace_id","cap_source","posted_at");