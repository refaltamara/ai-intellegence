-- Links required, and the triggers that keep a post (post_items) and its links (posts) in step (DECISIONS, 10 Oct 2026,
-- "One row per real thing"). Run `pnpm load backfill-items` before this on a database with posts: it gives every link its post.
-- The post's fields on a link are ITEM_COLS in src/loader/fold.ts; src/loader/__tests__/fold.test.ts checks this file against it.
ALTER TABLE "comments" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_post_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."post_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_item_idx" ON "comments" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_item_id_post_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."post_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_item_idx" ON "posts" USING btree ("item_id");--> statement-breakpoint
-- A new link takes its post's fields; a link to a post not seen before makes the post from the link's fields.
CREATE OR REPLACE FUNCTION "post_link_item"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i post_items%ROWTYPE;
BEGIN
  IF NEW.item_id IS NULL THEN
    SELECT * INTO i FROM post_items WHERE workspace_id = NEW.workspace_id AND platform = NEW.platform AND url = NEW.url;
    IF NOT FOUND THEN
      INSERT INTO post_items (workspace_id, platform, url, platform_post_id, creator_id, creator_handle, posted_at, month, caption, hashtags, tagged_handles, is_paid, followers_at_post, tier, content_format, content_type, views, likes, comments_count, shares, saves, engagements, engagements_lc, captured_days, stance, stance_source, topic_id, topic_confidence, voice, cap_product, cap_event, cap_event_name, cap_offer, cap_hook, cap_angle, cap_source, cap_read_at, flags, read_at, source_file, load_id)
      VALUES (NEW.workspace_id, NEW.platform, NEW.url, NEW.platform_post_id, NEW.creator_id, NEW.creator_handle, NEW.posted_at, NEW.month, NEW.caption, NEW.hashtags, NEW.tagged_handles, NEW.is_paid, NEW.followers_at_post, NEW.tier, NEW.content_format, NEW.content_type, NEW.views, NEW.likes, NEW.comments_count, NEW.shares, NEW.saves, NEW.engagements, NEW.engagements_lc, NEW.captured_days, NEW.stance, NEW.stance_source, NEW.topic_id, NEW.topic_confidence, NEW.voice, NEW.cap_product, NEW.cap_event, NEW.cap_event_name, NEW.cap_offer, NEW.cap_hook, NEW.cap_angle, NEW.cap_source, NEW.cap_read_at, NEW.flags, NEW.read_at, NEW.source_file, NEW.load_id)
      ON CONFLICT (workspace_id, platform, url) DO NOTHING
      RETURNING * INTO i;
      IF NOT FOUND THEN
        SELECT * INTO i FROM post_items WHERE workspace_id = NEW.workspace_id AND platform = NEW.platform AND url = NEW.url;
      END IF;
    END IF;
  ELSE
    SELECT * INTO i FROM post_items WHERE id = NEW.item_id;
    IF NOT FOUND OR (i.workspace_id, i.platform, i.url) IS DISTINCT FROM (NEW.workspace_id, NEW.platform, NEW.url) THEN
      RAISE EXCEPTION 'post_items % is not % %', NEW.item_id, NEW.platform, NEW.url;
    END IF;
  END IF;
  NEW.item_id := i.id;
  NEW.platform_post_id := i.platform_post_id;
  NEW.creator_id := i.creator_id;
  NEW.creator_handle := i.creator_handle;
  NEW.posted_at := i.posted_at;
  NEW.month := i.month;
  NEW.caption := i.caption;
  NEW.hashtags := i.hashtags;
  NEW.tagged_handles := i.tagged_handles;
  NEW.is_paid := i.is_paid;
  NEW.followers_at_post := i.followers_at_post;
  NEW.tier := i.tier;
  NEW.content_format := i.content_format;
  NEW.content_type := i.content_type;
  NEW.views := i.views;
  NEW.likes := i.likes;
  NEW.comments_count := i.comments_count;
  NEW.shares := i.shares;
  NEW.saves := i.saves;
  NEW.engagements := i.engagements;
  NEW.engagements_lc := i.engagements_lc;
  NEW.captured_days := i.captured_days;
  NEW.stance := i.stance;
  NEW.stance_source := i.stance_source;
  NEW.topic_id := i.topic_id;
  NEW.topic_confidence := i.topic_confidence;
  NEW.voice := i.voice;
  NEW.cap_product := i.cap_product;
  NEW.cap_event := i.cap_event;
  NEW.cap_event_name := i.cap_event_name;
  NEW.cap_offer := i.cap_offer;
  NEW.cap_hook := i.cap_hook;
  NEW.cap_angle := i.cap_angle;
  NEW.cap_source := i.cap_source;
  NEW.cap_read_at := i.cap_read_at;
  NEW.flags := i.flags;
  NEW.read_at := i.read_at;
  RETURN NEW;
END $$;--> statement-breakpoint
-- A change made through a link reaches its post: only the fields the statement changed. When one statement changes several
-- links of one post, the link with the most views speaks for it. Skipped when the change came from the post itself.
CREATE OR REPLACE FUNCTION "post_to_item"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  UPDATE post_items i SET
    platform_post_id = CASE WHEN (x.nl).platform_post_id IS DISTINCT FROM (x.ol).platform_post_id THEN (x.nl).platform_post_id ELSE i.platform_post_id END,
    creator_id = CASE WHEN (x.nl).creator_id IS DISTINCT FROM (x.ol).creator_id THEN (x.nl).creator_id ELSE i.creator_id END,
    creator_handle = CASE WHEN (x.nl).creator_handle IS DISTINCT FROM (x.ol).creator_handle THEN (x.nl).creator_handle ELSE i.creator_handle END,
    posted_at = CASE WHEN (x.nl).posted_at IS DISTINCT FROM (x.ol).posted_at THEN (x.nl).posted_at ELSE i.posted_at END,
    month = CASE WHEN (x.nl).month IS DISTINCT FROM (x.ol).month THEN (x.nl).month ELSE i.month END,
    caption = CASE WHEN (x.nl).caption IS DISTINCT FROM (x.ol).caption THEN (x.nl).caption ELSE i.caption END,
    hashtags = CASE WHEN (x.nl).hashtags IS DISTINCT FROM (x.ol).hashtags THEN (x.nl).hashtags ELSE i.hashtags END,
    tagged_handles = CASE WHEN (x.nl).tagged_handles IS DISTINCT FROM (x.ol).tagged_handles THEN (x.nl).tagged_handles ELSE i.tagged_handles END,
    is_paid = CASE WHEN (x.nl).is_paid IS DISTINCT FROM (x.ol).is_paid THEN (x.nl).is_paid ELSE i.is_paid END,
    followers_at_post = CASE WHEN (x.nl).followers_at_post IS DISTINCT FROM (x.ol).followers_at_post THEN (x.nl).followers_at_post ELSE i.followers_at_post END,
    tier = CASE WHEN (x.nl).tier IS DISTINCT FROM (x.ol).tier THEN (x.nl).tier ELSE i.tier END,
    content_format = CASE WHEN (x.nl).content_format IS DISTINCT FROM (x.ol).content_format THEN (x.nl).content_format ELSE i.content_format END,
    content_type = CASE WHEN (x.nl).content_type IS DISTINCT FROM (x.ol).content_type THEN (x.nl).content_type ELSE i.content_type END,
    views = CASE WHEN (x.nl).views IS DISTINCT FROM (x.ol).views THEN (x.nl).views ELSE i.views END,
    likes = CASE WHEN (x.nl).likes IS DISTINCT FROM (x.ol).likes THEN (x.nl).likes ELSE i.likes END,
    comments_count = CASE WHEN (x.nl).comments_count IS DISTINCT FROM (x.ol).comments_count THEN (x.nl).comments_count ELSE i.comments_count END,
    shares = CASE WHEN (x.nl).shares IS DISTINCT FROM (x.ol).shares THEN (x.nl).shares ELSE i.shares END,
    saves = CASE WHEN (x.nl).saves IS DISTINCT FROM (x.ol).saves THEN (x.nl).saves ELSE i.saves END,
    engagements = CASE WHEN (x.nl).engagements IS DISTINCT FROM (x.ol).engagements THEN (x.nl).engagements ELSE i.engagements END,
    engagements_lc = CASE WHEN (x.nl).engagements_lc IS DISTINCT FROM (x.ol).engagements_lc THEN (x.nl).engagements_lc ELSE i.engagements_lc END,
    captured_days = CASE WHEN (x.nl).captured_days IS DISTINCT FROM (x.ol).captured_days THEN (x.nl).captured_days ELSE i.captured_days END,
    stance = CASE WHEN (x.nl).stance IS DISTINCT FROM (x.ol).stance THEN (x.nl).stance ELSE i.stance END,
    stance_source = CASE WHEN (x.nl).stance_source IS DISTINCT FROM (x.ol).stance_source THEN (x.nl).stance_source ELSE i.stance_source END,
    topic_id = CASE WHEN (x.nl).topic_id IS DISTINCT FROM (x.ol).topic_id THEN (x.nl).topic_id ELSE i.topic_id END,
    topic_confidence = CASE WHEN (x.nl).topic_confidence IS DISTINCT FROM (x.ol).topic_confidence THEN (x.nl).topic_confidence ELSE i.topic_confidence END,
    voice = CASE WHEN (x.nl).voice IS DISTINCT FROM (x.ol).voice THEN (x.nl).voice ELSE i.voice END,
    cap_product = CASE WHEN (x.nl).cap_product IS DISTINCT FROM (x.ol).cap_product THEN (x.nl).cap_product ELSE i.cap_product END,
    cap_event = CASE WHEN (x.nl).cap_event IS DISTINCT FROM (x.ol).cap_event THEN (x.nl).cap_event ELSE i.cap_event END,
    cap_event_name = CASE WHEN (x.nl).cap_event_name IS DISTINCT FROM (x.ol).cap_event_name THEN (x.nl).cap_event_name ELSE i.cap_event_name END,
    cap_offer = CASE WHEN (x.nl).cap_offer IS DISTINCT FROM (x.ol).cap_offer THEN (x.nl).cap_offer ELSE i.cap_offer END,
    cap_hook = CASE WHEN (x.nl).cap_hook IS DISTINCT FROM (x.ol).cap_hook THEN (x.nl).cap_hook ELSE i.cap_hook END,
    cap_angle = CASE WHEN (x.nl).cap_angle IS DISTINCT FROM (x.ol).cap_angle THEN (x.nl).cap_angle ELSE i.cap_angle END,
    cap_source = CASE WHEN (x.nl).cap_source IS DISTINCT FROM (x.ol).cap_source THEN (x.nl).cap_source ELSE i.cap_source END,
    cap_read_at = CASE WHEN (x.nl).cap_read_at IS DISTINCT FROM (x.ol).cap_read_at THEN (x.nl).cap_read_at ELSE i.cap_read_at END,
    flags = CASE WHEN (x.nl).flags IS DISTINCT FROM (x.ol).flags THEN (x.nl).flags ELSE i.flags END,
    read_at = CASE WHEN (x.nl).read_at IS DISTINCT FROM (x.ol).read_at THEN (x.nl).read_at ELSE i.read_at END
  FROM (
    SELECT DISTINCT ON (n.item_id) n.item_id, n AS nl, o AS ol
      FROM new_links n JOIN old_links o ON o.id = n.id
     WHERE (n.platform_post_id, n.creator_id, n.creator_handle, n.posted_at, n.month, n.caption, n.hashtags, n.tagged_handles, n.is_paid, n.followers_at_post, n.tier, n.content_format, n.content_type, n.views, n.likes, n.comments_count, n.shares, n.saves, n.engagements, n.engagements_lc, n.captured_days, n.stance, n.stance_source, n.topic_id, n.topic_confidence, n.voice, n.cap_product, n.cap_event, n.cap_event_name, n.cap_offer, n.cap_hook, n.cap_angle, n.cap_source, n.cap_read_at, n.flags, n.read_at) IS DISTINCT FROM (o.platform_post_id, o.creator_id, o.creator_handle, o.posted_at, o.month, o.caption, o.hashtags, o.tagged_handles, o.is_paid, o.followers_at_post, o.tier, o.content_format, o.content_type, o.views, o.likes, o.comments_count, o.shares, o.saves, o.engagements, o.engagements_lc, o.captured_days, o.stance, o.stance_source, o.topic_id, o.topic_confidence, o.voice, o.cap_product, o.cap_event, o.cap_event_name, o.cap_offer, o.cap_hook, o.cap_angle, o.cap_source, o.cap_read_at, o.flags, o.read_at)
     ORDER BY n.item_id, n.views DESC NULLS LAST, n.read_at DESC NULLS LAST, n.likes DESC NULLS LAST, n.brand_id
  ) x
  WHERE i.id = x.item_id
    AND (i.platform_post_id, i.creator_id, i.creator_handle, i.posted_at, i.month, i.caption, i.hashtags, i.tagged_handles, i.is_paid, i.followers_at_post, i.tier, i.content_format, i.content_type, i.views, i.likes, i.comments_count, i.shares, i.saves, i.engagements, i.engagements_lc, i.captured_days, i.stance, i.stance_source, i.topic_id, i.topic_confidence, i.voice, i.cap_product, i.cap_event, i.cap_event_name, i.cap_offer, i.cap_hook, i.cap_angle, i.cap_source, i.cap_read_at, i.flags, i.read_at) IS DISTINCT FROM (CASE WHEN (x.nl).platform_post_id IS DISTINCT FROM (x.ol).platform_post_id THEN (x.nl).platform_post_id ELSE i.platform_post_id END, CASE WHEN (x.nl).creator_id IS DISTINCT FROM (x.ol).creator_id THEN (x.nl).creator_id ELSE i.creator_id END, CASE WHEN (x.nl).creator_handle IS DISTINCT FROM (x.ol).creator_handle THEN (x.nl).creator_handle ELSE i.creator_handle END, CASE WHEN (x.nl).posted_at IS DISTINCT FROM (x.ol).posted_at THEN (x.nl).posted_at ELSE i.posted_at END, CASE WHEN (x.nl).month IS DISTINCT FROM (x.ol).month THEN (x.nl).month ELSE i.month END, CASE WHEN (x.nl).caption IS DISTINCT FROM (x.ol).caption THEN (x.nl).caption ELSE i.caption END, CASE WHEN (x.nl).hashtags IS DISTINCT FROM (x.ol).hashtags THEN (x.nl).hashtags ELSE i.hashtags END, CASE WHEN (x.nl).tagged_handles IS DISTINCT FROM (x.ol).tagged_handles THEN (x.nl).tagged_handles ELSE i.tagged_handles END, CASE WHEN (x.nl).is_paid IS DISTINCT FROM (x.ol).is_paid THEN (x.nl).is_paid ELSE i.is_paid END, CASE WHEN (x.nl).followers_at_post IS DISTINCT FROM (x.ol).followers_at_post THEN (x.nl).followers_at_post ELSE i.followers_at_post END, CASE WHEN (x.nl).tier IS DISTINCT FROM (x.ol).tier THEN (x.nl).tier ELSE i.tier END, CASE WHEN (x.nl).content_format IS DISTINCT FROM (x.ol).content_format THEN (x.nl).content_format ELSE i.content_format END, CASE WHEN (x.nl).content_type IS DISTINCT FROM (x.ol).content_type THEN (x.nl).content_type ELSE i.content_type END, CASE WHEN (x.nl).views IS DISTINCT FROM (x.ol).views THEN (x.nl).views ELSE i.views END, CASE WHEN (x.nl).likes IS DISTINCT FROM (x.ol).likes THEN (x.nl).likes ELSE i.likes END, CASE WHEN (x.nl).comments_count IS DISTINCT FROM (x.ol).comments_count THEN (x.nl).comments_count ELSE i.comments_count END, CASE WHEN (x.nl).shares IS DISTINCT FROM (x.ol).shares THEN (x.nl).shares ELSE i.shares END, CASE WHEN (x.nl).saves IS DISTINCT FROM (x.ol).saves THEN (x.nl).saves ELSE i.saves END, CASE WHEN (x.nl).engagements IS DISTINCT FROM (x.ol).engagements THEN (x.nl).engagements ELSE i.engagements END, CASE WHEN (x.nl).engagements_lc IS DISTINCT FROM (x.ol).engagements_lc THEN (x.nl).engagements_lc ELSE i.engagements_lc END, CASE WHEN (x.nl).captured_days IS DISTINCT FROM (x.ol).captured_days THEN (x.nl).captured_days ELSE i.captured_days END, CASE WHEN (x.nl).stance IS DISTINCT FROM (x.ol).stance THEN (x.nl).stance ELSE i.stance END, CASE WHEN (x.nl).stance_source IS DISTINCT FROM (x.ol).stance_source THEN (x.nl).stance_source ELSE i.stance_source END, CASE WHEN (x.nl).topic_id IS DISTINCT FROM (x.ol).topic_id THEN (x.nl).topic_id ELSE i.topic_id END, CASE WHEN (x.nl).topic_confidence IS DISTINCT FROM (x.ol).topic_confidence THEN (x.nl).topic_confidence ELSE i.topic_confidence END, CASE WHEN (x.nl).voice IS DISTINCT FROM (x.ol).voice THEN (x.nl).voice ELSE i.voice END, CASE WHEN (x.nl).cap_product IS DISTINCT FROM (x.ol).cap_product THEN (x.nl).cap_product ELSE i.cap_product END, CASE WHEN (x.nl).cap_event IS DISTINCT FROM (x.ol).cap_event THEN (x.nl).cap_event ELSE i.cap_event END, CASE WHEN (x.nl).cap_event_name IS DISTINCT FROM (x.ol).cap_event_name THEN (x.nl).cap_event_name ELSE i.cap_event_name END, CASE WHEN (x.nl).cap_offer IS DISTINCT FROM (x.ol).cap_offer THEN (x.nl).cap_offer ELSE i.cap_offer END, CASE WHEN (x.nl).cap_hook IS DISTINCT FROM (x.ol).cap_hook THEN (x.nl).cap_hook ELSE i.cap_hook END, CASE WHEN (x.nl).cap_angle IS DISTINCT FROM (x.ol).cap_angle THEN (x.nl).cap_angle ELSE i.cap_angle END, CASE WHEN (x.nl).cap_source IS DISTINCT FROM (x.ol).cap_source THEN (x.nl).cap_source ELSE i.cap_source END, CASE WHEN (x.nl).cap_read_at IS DISTINCT FROM (x.ol).cap_read_at THEN (x.nl).cap_read_at ELSE i.cap_read_at END, CASE WHEN (x.nl).flags IS DISTINCT FROM (x.ol).flags THEN (x.nl).flags ELSE i.flags END, CASE WHEN (x.nl).read_at IS DISTINCT FROM (x.ol).read_at THEN (x.nl).read_at ELSE i.read_at END);
  RETURN NULL;
END $$;--> statement-breakpoint
-- A change to a post reaches every link.
CREATE OR REPLACE FUNCTION "item_to_links"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE posts p SET platform_post_id = n.platform_post_id, creator_id = n.creator_id, creator_handle = n.creator_handle, posted_at = n.posted_at, month = n.month, caption = n.caption, hashtags = n.hashtags, tagged_handles = n.tagged_handles, is_paid = n.is_paid, followers_at_post = n.followers_at_post, tier = n.tier, content_format = n.content_format, content_type = n.content_type, views = n.views, likes = n.likes, comments_count = n.comments_count, shares = n.shares, saves = n.saves, engagements = n.engagements, engagements_lc = n.engagements_lc, captured_days = n.captured_days, stance = n.stance, stance_source = n.stance_source, topic_id = n.topic_id, topic_confidence = n.topic_confidence, voice = n.voice, cap_product = n.cap_product, cap_event = n.cap_event, cap_event_name = n.cap_event_name, cap_offer = n.cap_offer, cap_hook = n.cap_hook, cap_angle = n.cap_angle, cap_source = n.cap_source, cap_read_at = n.cap_read_at, flags = n.flags, read_at = n.read_at
    FROM new_items n
   WHERE p.item_id = n.id AND (p.platform_post_id, p.creator_id, p.creator_handle, p.posted_at, p.month, p.caption, p.hashtags, p.tagged_handles, p.is_paid, p.followers_at_post, p.tier, p.content_format, p.content_type, p.views, p.likes, p.comments_count, p.shares, p.saves, p.engagements, p.engagements_lc, p.captured_days, p.stance, p.stance_source, p.topic_id, p.topic_confidence, p.voice, p.cap_product, p.cap_event, p.cap_event_name, p.cap_offer, p.cap_hook, p.cap_angle, p.cap_source, p.cap_read_at, p.flags, p.read_at) IS DISTINCT FROM (n.platform_post_id, n.creator_id, n.creator_handle, n.posted_at, n.month, n.caption, n.hashtags, n.tagged_handles, n.is_paid, n.followers_at_post, n.tier, n.content_format, n.content_type, n.views, n.likes, n.comments_count, n.shares, n.saves, n.engagements, n.engagements_lc, n.captured_days, n.stance, n.stance_source, n.topic_id, n.topic_confidence, n.voice, n.cap_product, n.cap_event, n.cap_event_name, n.cap_offer, n.cap_hook, n.cap_angle, n.cap_source, n.cap_read_at, n.flags, n.read_at);
  RETURN NULL;
END $$;--> statement-breakpoint
-- A post goes when its last link is deleted (a workspace reset, a link removed by hand).
CREATE OR REPLACE FUNCTION "drop_lone_items"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM post_items i USING (SELECT DISTINCT item_id FROM old_links) d
   WHERE i.id = d.item_id AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.item_id = i.id);
  RETURN NULL;
END $$;--> statement-breakpoint
-- A comment is on its link's post.
CREATE OR REPLACE FUNCTION "comment_item"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT item_id INTO NEW.item_id FROM posts WHERE id = NEW.post_id;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "posts_link_item" BEFORE INSERT ON "posts" FOR EACH ROW EXECUTE FUNCTION "post_link_item"();--> statement-breakpoint
CREATE TRIGGER "posts_to_item" AFTER UPDATE ON "posts" REFERENCING OLD TABLE AS old_links NEW TABLE AS new_links FOR EACH STATEMENT EXECUTE FUNCTION "post_to_item"();--> statement-breakpoint
CREATE TRIGGER "post_items_to_links" AFTER UPDATE ON "post_items" REFERENCING NEW TABLE AS new_items FOR EACH STATEMENT EXECUTE FUNCTION "item_to_links"();--> statement-breakpoint
CREATE TRIGGER "posts_drop_lone_items" AFTER DELETE ON "posts" REFERENCING OLD TABLE AS old_links FOR EACH STATEMENT EXECUTE FUNCTION "drop_lone_items"();--> statement-breakpoint
CREATE TRIGGER "comments_item" BEFORE INSERT OR UPDATE OF post_id ON "comments" FOR EACH ROW EXECUTE FUNCTION "comment_item"();--> statement-breakpoint
ANALYZE "post_items";--> statement-breakpoint
ANALYZE "posts";--> statement-breakpoint
ANALYZE "comments";
