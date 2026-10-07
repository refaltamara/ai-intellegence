ALTER TABLE "comments" ADD COLUMN "voice" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "topic_confidence" numeric;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "voice" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;