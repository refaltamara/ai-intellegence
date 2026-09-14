ALTER TABLE "creators" DROP CONSTRAINT "creators_platform_chk";--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_platform_chk";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "views" bigint;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "sentiment_source" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "sentiment_confidence" numeric;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "stance" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "stance_source" text;--> statement-breakpoint
CREATE INDEX "comments_workspace_posted_idx" ON "comments" USING btree ("workspace_id","posted_at");--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_platform_chk" CHECK ("creators"."platform" in ('tiktok','instagram','threads','x','youtube'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_stance_chk" CHECK ("posts"."stance" is null or "posts"."stance" in ('positive','neutral','negative'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_platform_chk" CHECK ("posts"."platform" in ('tiktok','instagram','threads','x','youtube'));