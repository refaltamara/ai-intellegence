/**
 * Fair Intel canonical schema (Drizzle). See docs/PRD.md §3, adapted by
 * docs/DATA_NOTES.md and docs/DECISIONS.md:
 *  - brands.id = canonical slug from data/seed/brand_mapping_master.csv
 *  - posts are unique on (workspace_id, platform, url, brand_id): an Instagram
 *    post tagging several brands is one row per brand
 *  - tiers are recomputed from followers on load (src/config/thresholds.ts)
 *  - owned vs earned exists on TikTok only
 * Every table carries workspace_id.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const PLATFORMS = ["tiktok", "instagram", "threads", "x", "youtube"] as const;
export const SOURCES = ["owned", "earned"] as const;
export const TIERS = ["nano", "micro", "mid", "macro", "mega"] as const;

// ---------------------------------------------------------------- workspace
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * A workspace is a subject (DECISIONS, 14 Sep): a category panel of brands, one
 * artist, one executive. Same tables underneath; the product name, persona and
 * on-screen words come from `kind` and `settings` (src/workspace/config.ts).
 */
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  clientBrandId: text("client_brand_id"),
  tz: text("tz").notNull().default("Asia/Jakarta"),
  /** 'category' (brands compete) | 'profile' (one subject, its own voice) */
  kind: text("kind").notNull().default("category"),
  /** product_name, tagline, category_label, subject_noun, persona, hero_title, hero_intro, suggested[] — all optional, defaults per kind */
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  /** CMS plan, Workspace lifecycle: draft → loading → review → live → paused → archived; clients only reach a live one */
  status: text("status").notNull().default("live"),
  createdAt: createdAt(),
});

/**
 * One person (CMS plan, People and access): one sign-in for every workspace they belong
 * to. Fair staff carry duties: owner (Refal, Rafli: release, deploy, prices), role_owner
 * (improve the roles), designer (may change design), data_ops (set up and run
 * workspaces). Like mcp_clients it belongs to no workspace: a person is not a
 * workspace's data; what they may do in one lives in their membership (users).
 */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  /** when the password was last set; sessions signed in before it no longer pass (src/auth/live.ts) */
  passwordSetAt: ts("password_set_at"),
  staff: text("staff").array().notNull().default(sql`'{}'::text[]`),
  lastSeenAt: ts("last_seen_at"),
  createdAt: createdAt(),
});

/**
 * A one-time link to set a new password (src/auth/passwordLinks.ts): made by Fair from the CMS
 * (People) or by the person from "Forgot your password?". Only the hash of the token is kept;
 * a link works once and expires. Account-level, like accounts: no workspace.
 */
export const passwordLinks = pgTable(
  "password_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** the email of whoever asked for it ("self" from the sign-in page) */
    createdBy: text("created_by").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("password_links_account_idx").on(t.accountId, t.createdAt)],
);

/**
 * A membership: one account in one workspace (since 4 Oct 2026; before that a row was
 * the whole account). `levels` says which roles the person may use there and how:
 * builder (shapes the company's version, approves, invites) or member. Everything a
 * person makes in a workspace (chats, decks, settings) points here.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").notNull().default("member"),
    passwordHash: text("password_hash"),
    whatsappE164: text("whatsapp_e164"),
    accountId: uuid("account_id").references((): AnyPgColumn => accounts.id, { onDelete: "cascade" }),
    levels: jsonb("levels").notNull().default(sql`'{}'::jsonb`),
    invitedBy: text("invited_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_workspace_email_uq").on(t.workspaceId, t.email), index("users_account_idx").on(t.accountId)],
);

/** An invitation to a workspace (a Builder or Member) or to Fair's staff; the token is stored as a SHA-256 hash. */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    email: text("email").notNull(),
    name: text("name"),
    levels: jsonb("levels").notNull().default(sql`'{}'::jsonb`),
    staff: text("staff").array().notNull().default(sql`'{}'::text[]`),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invites_workspace_idx").on(t.workspaceId, t.createdAt)],
);

// ------------------------------------------------------------------- brands
export const brands = pgTable(
  "brands",
  {
    /** canonical slug, e.g. 'skintific_official' */
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    name: text("name").notNull(),
    isClient: boolean("is_client").notNull().default(false),
    tiktokHandle: text("tiktok_handle"),
    instagramHandle: text("instagram_handle"),
    /** 'both' | 'tiktok' | 'instagram' */
    trackedOn: text("tracked_on").notNull(),
    /** {"tiktok":["..."],"instagram":["..."],"threads":[],"x":[]} */
    ownedHandles: jsonb("owned_handles").notNull().default(sql`'{}'::jsonb`),
    keywords: jsonb("keywords").notNull().default(sql`'[]'::jsonb`),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("brands_workspace_idx").on(t.workspaceId)],
);

// ----------------------------------------------------------------- creators
export const creators = pgTable(
  "creators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    followersLatest: integer("followers_latest"),
    /** computed from followers_latest via src/config/thresholds.ts; null when followers unknown */
    tierLatest: text("tier_latest"),
    location: text("location"),
    firstSeen: date("first_seen"),
    lastSeen: date("last_seen"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("creators_workspace_platform_handle_uq").on(t.workspaceId, t.platform, t.handle),
    check("creators_platform_chk", sql`${t.platform} in ('tiktok','instagram','threads','x','youtube')`),
  ],
);

export const creatorSnapshots = pgTable(
  "creator_snapshots",
  {
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
    capturedAt: date("captured_at").notNull(),
    followers: integer("followers"),
  },
  (t) => [primaryKey({ columns: [t.creatorId, t.capturedAt] })],
);

// -------------------------------------------------------------------- posts
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    platform: text("platform").notNull(),
    /** TikTok content_id / Instagram shortcode; informational, url is the identity */
    platformPostId: text("platform_post_id"),
    /** null for owned-account posts and for the 1,093 TikTok short-url rows with no handle */
    creatorId: uuid("creator_id").references(() => creators.id),
    /** raw creator_username, kept for readability and for owned accounts */
    creatorHandle: text("creator_handle"),
    brandId: text("brand_id").notNull().references(() => brands.id),
    /** 'owned' | 'earned' — owned exists on TikTok only */
    source: text("source").notNull(),
    /** 'keyword' (TikTok capture) | 'tagged' (Instagram capture) | 'owned' */
    collection: text("collection").notNull(),
    /** TikTok: influencer | owned_main | owned_sub | reseller; null on Instagram */
    accountType: text("account_type"),
    postedAt: ts("posted_at").notNull(),
    /** first day of month (workspace tz) for fast grouping */
    month: date("month").notNull(),
    url: text("url").notNull(),
    caption: text("caption"),
    /** full-text form of the caption ('simple' config: no stemming, mixed Indonesian/English); drives /themes and /products keyword search */
    captionTsv: tsvector("caption_tsv").generatedAlwaysAs(sql`to_tsvector('simple', coalesce(caption, ''))`),
    /** accounts the post tags (listening content_tagged_user), lowercased; one of the signals that it is about its brand */
    taggedHandles: text("tagged_handles").array(),
    hashtags: text("hashtags").array(),
    isPaid: boolean("is_paid"),
    /** TikTok yc_flag: true = shoppable link, false = product tagged without link, null = nothing tagged / Instagram */
    hasCart: boolean("has_cart"),
    isReseller: boolean("is_reseller").notNull().default(false),
    followersAtPost: integer("followers_at_post"),
    /** tier recomputed from followers_at_post; null when followers unknown or 0 */
    tier: text("tier"),
    universe: text("universe"),
    categoryBroad: text("category_broad"),
    productCategory: text("product_category"),
    contentFormat: text("content_format"),
    contentType: text("content_type"),
    productName: text("product_name"),
    productUrl: text("product_url"),
    price: numeric("price"),
    priceOriginal: numeric("price_original"),
    discountPercent: numeric("discount_percent"),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
    shares: integer("shares"),
    saves: integer("saves"),
    /** platform-native engagement: TikTok likes+comments+shares+saves, Instagram likes+comments */
    engagements: integer("engagements"),
    /** likes+comments on both platforms; use for cross-platform comparison */
    engagementsLc: integer("engagements_lc"),
    capturedDays: integer("captured_days"),
    /** profile workspaces only: what an earned post says about the subject ('positive' | 'neutral' | 'negative'); owned posts and category workspaces stay null */
    stance: text("stance"),
    stanceSource: text("stance_source"),
    /** profile workspaces with topics (settings.label; src/label/): the topic the labeller put the post under */
    topicId: text("topic_id").references((): AnyPgColumn => topics.id),
    topicConfidence: numeric("topic_confidence"),
    /** which community the author speaks as, when the workspace names voices (settings.label.voices), e.g. Malaysian | Indonesian | unclear */
    voice: text("voice"),
    /**
     * Caption reading (DECISIONS, 2 Oct 2026; src/captions/): what the post is about, read by the model
     * from the caption, the same on every brand row of one url. Category workspaces, posts that matter
     * (views over the workspace's floor, or brand accounts). The model names; SQL counts.
     */
    capProduct: text("cap_product"),
    capEvent: text("cap_event"),
    capEventName: text("cap_event_name"),
    capOffer: text("cap_offer"),
    capHook: text("cap_hook"),
    capAngle: text("cap_angle"),
    /** 'model' | 'model_failed' (tried once more) | 'model_failed_final' */
    capSource: text("cap_source"),
    capReadAt: ts("cap_read_at"),
    /**
     * Is the post about its brand (DECISIONS 3 Oct 2026)? Listening workspaces judge it at load: the brand
     * posted it, or the caption names the brand (its terms in brands.keywords, its handles). false rows stay
     * stored and are left out of every reputation number; null means not judged (counted).
     */
    relevant: boolean("relevant"),
    /**
     * The link (DECISIONS, 10 Oct 2026, "One row per real thing"): this row is the post's link to one brand. The post
     * itself is post_items (item_id); the fields that are about the post (ITEM_COLS in src/loader/fold.ts) are a copy of
     * the item's, kept in step by triggers (migration 0035): a change made through any link reaches the item and its other
     * links, and a new link takes its post's fields. The rest is about the post and this brand.
     *   match         how we know: owned (the brand's handle posted it) | tagged (its handle was tagged) | keyword (a brand term
     *                 in the caption) | mention (named in the text, found by the model)
     *   term          the term that matched, for keyword matches
     *   checked_by    who last judged relevance: a rule, a model or a person (labels hold the history)
     *   brought_in_by what brought the post in: the panel's own setup ('panel') or a case
     */
    itemId: uuid("item_id").notNull().references((): AnyPgColumn => postItems.id),
    match: text("match"),
    term: text("term"),
    checkedBy: text("checked_by"),
    broughtInBy: text("brought_in_by").notNull().default("panel"),
    /**
     * Warnings from the load's checks (DECISIONS, 10 Oct 2026): 'zero_followers' (the account reported 0 followers),
     * 'zero_views' (a video reported 0 views). The row counts as a post; it stays out of rates and medians.
     */
    flags: text("flags").array(),
    /** when this post's numbers (views, likes, …) were read: they are its latest reading (post_readings keeps them all) */
    readAt: ts("read_at"),
    sourceFile: text("source_file"),
    loadId: uuid("load_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("posts_workspace_platform_url_brand_uq").on(t.workspaceId, t.platform, t.url, t.brandId),
    index("posts_workspace_brand_posted_idx").on(t.workspaceId, t.brandId, t.postedAt),
    index("posts_creator_posted_idx").on(t.creatorId, t.postedAt),
    index("posts_month_platform_idx").on(t.month, t.platform),
    index("posts_workspace_platform_posted_idx").on(t.workspaceId, t.platform, t.postedAt),
    index("posts_hashtags_gin").using("gin", t.hashtags),
    index("posts_caption_tsv_gin").using("gin", t.captionTsv),
    // the few posts set aside as not about their brand: comment queries skip their comments without reading every post
    index("posts_not_relevant_idx").on(t.id).where(sql`${t.relevant} = false`),
    // the posts only a case brought in (definition case_post): the panel's comment queries skip the comments under them the same way
    index("posts_case_only_idx").on(t.id).where(sql`${t.broughtInBy} <> 'panel'`),
    check("posts_platform_chk", sql`${t.platform} in ('tiktok','instagram','threads','x','youtube')`),
    check("posts_source_chk", sql`${t.source} in ('owned','earned')`),
    check("posts_tier_chk", sql`${t.tier} is null or ${t.tier} in ('nano','micro','mid','macro','mega')`),
    check("posts_stance_chk", sql`${t.stance} is null or ${t.stance} in ('positive','neutral','negative')`),
    index("posts_cap_pick_idx").on(t.workspaceId, t.capSource, t.postedAt),
    index("posts_item_idx").on(t.itemId),
  ],
);

/**
 * One row per real post (DECISIONS, 10 Oct 2026, "One row per real thing"): keyed by platform and url, whatever brands it
 * is about. Its links to brands are the posts rows (item_id), which carry a copy of these fields for speed, kept in step
 * by triggers (migration 0035). What is about the post sits here; what is about the post and one brand (owned or earned,
 * relevance, the brand's universe and category, its product and price, a cart or a reseller) stays on the link.
 * When a post's brand rows disagree, src/loader/fold.ts decides: the numbers of the reading with the most views, the
 * earliest time, the longest caption, the creator with the highest follower count.
 */
export const postItems = pgTable(
  "post_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    platformPostId: text("platform_post_id"),
    creatorId: uuid("creator_id").references(() => creators.id),
    creatorHandle: text("creator_handle"),
    postedAt: ts("posted_at").notNull(),
    month: date("month").notNull(),
    caption: text("caption"),
    hashtags: text("hashtags").array(),
    taggedHandles: text("tagged_handles").array(),
    isPaid: boolean("is_paid"),
    followersAtPost: integer("followers_at_post"),
    tier: text("tier"),
    contentFormat: text("content_format"),
    contentType: text("content_type"),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
    shares: integer("shares"),
    saves: integer("saves"),
    engagements: integer("engagements"),
    engagementsLc: integer("engagements_lc"),
    capturedDays: integer("captured_days"),
    stance: text("stance"),
    stanceSource: text("stance_source"),
    topicId: text("topic_id"),
    topicConfidence: numeric("topic_confidence"),
    voice: text("voice"),
    capProduct: text("cap_product"),
    capEvent: text("cap_event"),
    capEventName: text("cap_event_name"),
    capOffer: text("cap_offer"),
    capHook: text("cap_hook"),
    capAngle: text("cap_angle"),
    capSource: text("cap_source"),
    capReadAt: ts("cap_read_at"),
    flags: text("flags").array(),
    readAt: ts("read_at"),
    sourceFile: text("source_file"),
    loadId: uuid("load_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("post_items_workspace_platform_url_uq").on(t.workspaceId, t.platform, t.url),
    index("post_items_workspace_posted_idx").on(t.workspaceId, t.postedAt),
  ],
);

/**
 * A post's numbers at a moment (DECISIONS, 10 Oct 2026, "Readings keep their time"): every reading a source gives, kept
 * with when it was read and the post's age then; the latest is copied onto the post (posts.views, …, posts.read_at).
 * Split by month of reading (migration 0033: range partitions on read_at). A Fair Listening dump gives day 0 to 30 with
 * its own day index (day_n); an export gives one reading, read when the file was made. post_snapshots is a view of the
 * readings that carry a day index, for the code that reads them so.
 */
export const postReadings = pgTable(
  "post_readings",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    readAt: ts("read_at").notNull(),
    /** hours since the post went up, at the reading */
    ageHours: integer("age_hours"),
    /** the day of the reading: a dump's own day index (0 to 30), else whole days since the post went up */
    dayN: smallint("day_n").notNull(),
    /** 'listening' (a dump's day-by-day tracking) | 'export' (one reading, when the file was made) */
    source: text("source").notNull(),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
    shares: integer("shares"),
    saves: integer("saves"),
    loadId: uuid("load_id"),
  },
  // a dump sometimes gives two day indices one fetch time: both are kept
  (t) => [primaryKey({ columns: [t.postId, t.readAt, t.dayN] }), index("post_readings_post_day_idx").on(t.postId, t.dayN)],
);

/**
 * Each post's reading at day 7 (DECISIONS, 10 Oct 2026; definition views_d7 in src/definitions/catalog.ts): the reading
 * nearest day 7 after posting, from any of its links' readings. A post that went up less than 7 days before the
 * workspace's latest reading counts its latest reading so far (so_far): its views will still grow. Rebuilt from
 * post_readings by src/definitions/totals.ts.
 */
export const postD7 = pgTable(
  "post_d7",
  {
    itemId: uuid("item_id").primaryKey().references(() => postItems.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** the day index of the reading used */
    dayN: smallint("day_n"),
    /** the post is under 7 days old at the workspace's latest reading: this is its latest reading, so far */
    soFar: boolean("so_far").notNull().default(false),
    readAt: ts("read_at"),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
    shares: integer("shares"),
    saves: integer("saves"),
  },
  (t) => [index("post_d7_workspace_idx").on(t.workspaceId)],
);

/**
 * Daily totals (DECISIONS, 10 Oct 2026, "Every number has one definition"): per workspace, local day of posting, brand,
 * platform and owned or earned, the sums every screen's numbers are made of, by the definitions in
 * src/definitions/catalog.ts. A brand's row counts its links (a post about two brands counts for both); brand '*' counts
 * each post once, for the whole panel. Posts set aside as not about their brand never count; flagged posts count, but
 * stay out of the rated sums that rates are made of. Rebuilt per workspace by src/definitions/totals.ts.
 *   views, engagement, ...       the latest reading
 *   d7_*                         the reading at day 7, or the latest so far for posts under 7 days old (so_far_posts)
 *   rated_* / rated_lc_*         posts that can carry a rate: not flagged, views over 0, engagement no more than views
 */
export const dailyTotals = pgTable(
  "daily_totals",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    day: date("day").notNull(),
    brandId: text("brand_id").notNull(),
    platform: text("platform").notNull(),
    source: text("source").notNull(),
    posts: integer("posts").notNull(),
    flagged: integer("flagged").notNull(),
    cartPosts: integer("cart_posts").notNull(),
    views: bigint("views", { mode: "number" }).notNull(),
    engagement: bigint("engagement", { mode: "number" }).notNull(),
    engagementLc: bigint("engagement_lc", { mode: "number" }).notNull(),
    comments: bigint("comments", { mode: "number" }).notNull(),
    ratedPosts: integer("rated_posts").notNull(),
    ratedViews: bigint("rated_views", { mode: "number" }).notNull(),
    ratedEngagement: bigint("rated_engagement", { mode: "number" }).notNull(),
    ratedLcPosts: integer("rated_lc_posts").notNull(),
    ratedLcViews: bigint("rated_lc_views", { mode: "number" }).notNull(),
    ratedLcEngagement: bigint("rated_lc_engagement", { mode: "number" }).notNull(),
    d7Posts: integer("d7_posts").notNull(),
    /** posts under 7 days old at the latest reading, counted at their latest reading so far */
    soFarPosts: integer("so_far_posts").notNull().default(0),
    d7Views: bigint("d7_views", { mode: "number" }).notNull(),
    d7Engagement: bigint("d7_engagement", { mode: "number" }).notNull(),
    d7EngagementLc: bigint("d7_engagement_lc", { mode: "number" }).notNull(),
    d7RatedPosts: integer("d7_rated_posts").notNull(),
    d7RatedViews: bigint("d7_rated_views", { mode: "number" }).notNull(),
    d7RatedEngagement: bigint("d7_rated_engagement", { mode: "number" }).notNull(),
    d7RatedLcPosts: integer("d7_rated_lc_posts").notNull(),
    d7RatedLcViews: bigint("d7_rated_lc_views", { mode: "number" }).notNull(),
    d7RatedLcEngagement: bigint("d7_rated_lc_engagement", { mode: "number" }).notNull(),
    /** the definitions' version the row was counted with */
    definitions: text("definitions").notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day, t.brandId, t.platform, t.source] }), index("daily_totals_brand_idx").on(t.workspaceId, t.brandId, t.day)],
);

/**
 * Daily totals per creator (definitions creators, affiliator, viewership_mix): a creator's earned posts per local day,
 * brand and platform. Distinct creators, affiliators (a cart post in the period) and the viewership mix are worked out per
 * period from these, never stored. Rebuilt with daily_totals.
 */
export const dailyCreators = pgTable(
  "daily_creators",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    day: date("day").notNull(),
    brandId: text("brand_id").notNull(),
    platform: text("platform").notNull(),
    creatorId: uuid("creator_id").notNull(),
    posts: integer("posts").notNull(),
    cartPosts: integer("cart_posts").notNull(),
    views: bigint("views", { mode: "number" }).notNull(),
    d7Views: bigint("d7_views", { mode: "number" }).notNull(),
    engagementLc: bigint("engagement_lc", { mode: "number" }).notNull(),
    followers: integer("followers"),
    definitions: text("definitions").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day, t.brandId, t.platform, t.creatorId] }), index("daily_creators_creator_idx").on(t.workspaceId, t.creatorId, t.day)],
);

/** Aggregated imports for months without post-level data. Skills flag reduced confidence. */
export const creatorBrandMonthImport = pgTable(
  "creator_brand_month_import",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    platform: text("platform").notNull(),
    month: date("month").notNull(),
    brandId: text("brand_id").notNull().references(() => brands.id),
    creatorId: uuid("creator_id").notNull().references(() => creators.id),
    rank: integer("rank"),
    posts: integer("posts"),
    views: bigint("views", { mode: "number" }),
    medianViews: bigint("median_views", { mode: "number" }),
    engagements: bigint("engagements", { mode: "number" }),
    erPct: numeric("er_pct"),
    viewsPer1kFollowers: numeric("views_per_1k_followers"),
    cartPct: numeric("cart_pct"),
    sampleUrl: text("sample_url"),
    derived: boolean("derived").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.platform, t.month, t.brandId, t.creatorId] })],
);

// ---------------------------------------------------------- phase 2 tables
export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  /** one line: what belongs here (CMS: Topics) */
  definition: text("definition"),
  /** service | promo | product | reputation: what the roles read a topic as */
  tags: text("tags").array(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  label: text("label").notNull(),
  parentId: text("parent_id"),
  /** 'objection' | 'question' | 'claim' | 'general' */
  kind: text("kind").notNull().default("general"),
  /** display order; listening workspaces bring their own taxonomy (etl/load_listening.py) */
  sortOrder: integer("sort_order").notNull().default(0),
  /** the catch-all bucket ("Others") */
  isCatchAll: boolean("is_catch_all").notNull().default(false),
  /** a case's own topic (cases below); empty for the panel's */
  caseId: text("case_id").references((): AnyPgColumn => cases.id),
});

/**
 * A case (DECISIONS, 10 Oct 2026, step 5): an ad hoc watch inside a panel, such as a crisis or a one-off check. Its posts
 * are stored once with the panel's and counted apart: a post only a case brought in (posts.brought_in_by = the case's id)
 * counts in that case and never in the panel's everyday numbers, creators or tiers; a post the panel also caught counts
 * in both. Only the people on its access list see it, Fair staff included (src/auth/can.ts).
 */
export const cases = pgTable(
  "cases",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    name: text("name").notNull(),
    /** what the case is about, in a sentence or two */
    about: text("about"),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    /** empty while the case runs on */
    endsOn: date("ends_on", { mode: "string" }),
    /** words the case watches beyond the panel's own brand terms */
    terms: text("terms").array().notNull().default(sql`'{}'::text[]`),
    /** the platforms it watches; empty means the panel's */
    platforms: text("platforms").array(),
    /** how often its posts are read: daily, or hourly for a crisis (hourly fetching costs more) */
    pace: text("pace").notNull().default("daily"),
    /** the scraper request behind it */
    scraperRequest: text("scraper_request"),
    /** who may see it, by email; nobody else does, Fair staff included */
    access: text("access").array().notNull(),
    /** open | closed */
    status: text("status").notNull().default("open"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("cases_workspace_idx").on(t.workspaceId),
    check("cases_access_chk", sql`cardinality(${t.access}) > 0`),
    check("cases_pace_chk", sql`${t.pace} in ('daily','hourly')`),
    check("cases_status_chk", sql`${t.status} in ('open','closed')`),
  ],
);

/** The posts a case caught, whether or not the panel caught them too: a case's numbers count these. */
export const casePosts = pgTable(
  "case_posts",
  {
    caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references((): AnyPgColumn => postItems.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** the load that brought it in */
    loadId: uuid("load_id"),
    addedAt: ts("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.itemId] }), index("case_posts_item_idx").on(t.itemId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    /**
     * the real post (post_items), set from the comment's link by a trigger (migration 0036): a comment is on the post, so it
     * counts for every brand the post links to (DECISIONS, 10 Oct 2026)
     */
    itemId: uuid("item_id").notNull().references((): AnyPgColumn => postItems.id),
    /** denormalised from the post so sentiment queries never join for it */
    platform: text("platform"),
    platformCommentId: text("platform_comment_id").notNull(),
    authorHandle: text("author_handle"),
    /** sha256(platform || handle) for graph work */
    authorHash: text("author_hash"),
    text: text("text"),
    postedAt: ts("posted_at"),
    likes: integer("likes"),
    /** X exposes per-reply views; null elsewhere */
    views: bigint("views", { mode: "number" }),
    sentiment: text("sentiment"),
    /** true when the comment is not about the subject at all (promo spam, unrelated chatter under a viral post);
     *  such comments carry no sentiment and are excluded from every share. */
    offTopic: boolean("off_topic"),
    /** 'model' (labelled by /api/cron/label) | 'listening' (came with the export) | 'subject' (the subject's own reply, never labelled) */
    sentimentSource: text("sentiment_source"),
    sentimentConfidence: numeric("sentiment_confidence"),
    /**
     * Listening workspaces arrive labelled (sentiment_source 'listening'): the five-point scale is kept here
     * ('excellent' | 'good' | 'neutral' | 'average' | 'negative' | 'unknown') with its CSAT (1-5); `sentiment`
     * holds the three-class view (excellent+good positive, average+negative negative; DECISIONS 3 Oct 2026).
     */
    sentimentDetail: text("sentiment_detail"),
    csat: smallint("csat"),
    /** the listening model's free-text theme ("brand praise", "missed promo"), mapped to topic_id upstream */
    theme: text("theme"),
    purchaseIntent: boolean("purchase_intent"),
    /** English translation from the listening model */
    translation: text("translation"),
    topicId: text("topic_id").references(() => topics.id),
    topicConfidence: numeric("topic_confidence"),
    /** as posts.voice: the community the commenter speaks as, when the workspace names voices */
    voice: text("voice"),
    classifiedAt: ts("classified_at"),
  },
  (t) => [
    uniqueIndex("comments_workspace_platform_comment_uq").on(t.workspaceId, t.platformCommentId),
    index("comments_post_idx").on(t.postId),
    index("comments_item_idx").on(t.itemId),
    index("comments_workspace_posted_idx").on(t.workspaceId, t.postedAt),
    check("comments_sentiment_chk", sql`${t.sentiment} is null or ${t.sentiment} in ('positive','neutral','negative')`),
  ],
);

// ------------------------------------------------------------------- labels
/**
 * Who made a judgment (DECISIONS, 10 Oct 2026, "Judgments keep their author"): 'vendor:fair-listening' (labels that come
 * with a dump), 'model:<model id>' with the fingerprint of the instructions it ran with, 'rule:<name>' (relevance terms,
 * one spelling per name), 'person:<email>' (a check by hand). Labels made before 10 Oct carry version 'before 10 Oct 2026'.
 */
export const labellers = pgTable(
  "labellers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    version: text("version").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("labellers_name_version_uq").on(t.name, t.version)],
);

/**
 * Every judgment is its own row (DECISIONS, 10 Oct 2026): what it labels, the kind, the value, its confidence, who made
 * it and when. A new labeller adds rows and never overwrites; the newest of each kind is copied onto the post or comment
 * (posts.stance, comments.sentiment, …) for speed. Kinds: sentiment, off_topic, topic, voice, theme, intent, translation
 * (comments); stance, relevant, topic, voice, caption_* (posts).
 */
export const labels = pgTable(
  "labels",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** 'post' | 'comment' */
    target: text("target").notNull(),
    targetId: uuid("target_id").notNull(),
    kind: text("kind").notNull(),
    value: text("value"),
    confidence: real("confidence"),
    labellerId: integer("labeller_id").notNull().references(() => labellers.id),
    labelledAt: ts("labelled_at").notNull().defaultNow(),
  },
  (t) => [
    index("labels_target_idx").on(t.target, t.targetId, t.kind, t.labelledAt),
    index("labels_ws_kind_idx").on(t.workspaceId, t.kind, t.labelledAt),
    check("labels_target_chk", sql`${t.target} in ('post','comment')`),
  ],
);

// ------------------------------------------------------------- load ledger
/** One row per loader run per file; drives the Data page and meta.freshness. */
export const dataLoads = pgTable(
  "data_loads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    file: text("file").notNull(),
    platform: text("platform"),
    kind: text("kind").notNull(),
    rowsIn: integer("rows_in").notNull().default(0),
    rowsLoaded: integer("rows_loaded").notNull().default(0),
    rowsRejected: integer("rows_rejected").notNull().default(0),
    report: jsonb("report").notNull().default(sql`'{}'::jsonb`),
    /** the staged load this write came from (src/loader/), and the raw file it read */
    stagingLoadId: uuid("staging_load_id"),
    rawFileId: uuid("raw_file_id"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("data_loads_workspace_started_idx").on(t.workspaceId, t.startedAt)],
);

/**
 * Raw files as received (DECISIONS, 10 Oct 2026, "Data architecture V1"): kept in private Vercel Blob at
 * blob_path, never in the repository, until keep_until (12 months). data/raw/MANIFEST.json is the list in the
 * repository; this table is where each file is known to be stored (stored_at), or why it is not (store_error).
 * Loads point here, so a number traces to its rows, each row to a load, and each load to its file.
 */
export const rawFiles = pgTable(
  "raw_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** where the file sat under data/raw when it was listed */
    path: text("path").notNull(),
    blobPath: text("blob_path").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    received: date("received").notNull(),
    keepUntil: date("keep_until").notNull(),
    storedAt: ts("stored_at"),
    storeError: text("store_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("raw_files_blob_path_uq").on(t.blobPath), index("raw_files_workspace_idx").on(t.workspaceId, t.received)],
);

// --------------------------------------------------------------- app tables
export const skillRuns = pgTable(
  "skill_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    skill: text("skill").notNull(),
    params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
    paramsResolved: jsonb("params_resolved").notNull().default(sql`'{}'::jsonb`),
    result: jsonb("result"),
    status: text("status").notNull(),
    actor: jsonb("actor").notNull().default(sql`'{}'::jsonb`),
    agentRunId: uuid("agent_run_id"),
    durationMs: integer("duration_ms"),
    /** the evidence pane's view of this run (PRD-v2 §2.3): sort, filter, excluded row keys */
    paneState: jsonb("pane_state"),
    paneTitle: text("pane_title"),
    createdAt: createdAt(),
  },
  (t) => [index("skill_runs_workspace_created_idx").on(t.workspaceId, t.createdAt)],
);

/** Every spreadsheet handed out (PRD-v2 §13.1): which run, who, which format, how many rows. */
export const exports = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    skillRunId: uuid("skill_run_id").notNull().references(() => skillRuns.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    format: text("format").notNull(),
    rows: integer("rows").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("exports_run_idx").on(t.skillRunId, t.createdAt)],
);

/** Work attaches to a decision, not a date (PRD-v2 §6). A decision may override the workspace client. */
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** open | decided | archived */
    status: text("status").notNull().default("open"),
    outcome: text("outcome"),
    /** the brand CeMO is on the side of for this decision; null = workspace client */
    clientBrandId: text("client_brand_id").references(() => brands.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("decisions_workspace_status_idx").on(t.workspaceId, t.status, t.updatedAt),
    check("decisions_status_chk", sql`${t.status} in ('open','decided','archived')`),
  ],
);

/** Evidence objects pinned to a decision (a persisted skill run). */
export const pins = pgTable(
  "pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
    skillRunId: uuid("skill_run_id").notNull().references(() => skillRuns.id, { onDelete: "cascade" }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pins_decision_run_uq").on(t.decisionId, t.skillRunId)],
);

/** The brief CeMO opens the day with. One per data state (data_key), regenerated when the data changes. */
export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** freshness + last load timestamp; a new key means new data */
    dataKey: text("data_key").notNull(),
    content: jsonb("content").notNull(),
    evidence: jsonb("evidence"),
    quiet: boolean("quiet").notNull().default(false),
    generatedAt: ts("generated_at").notNull().defaultNow(),
    seenAt: ts("seen_at"),
  },
  (t) => [index("briefs_workspace_generated_idx").on(t.workspaceId, t.generatedAt)],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").references(() => users.id),
  decisionId: uuid("decision_id").references(() => decisions.id, { onDelete: "set null" }),
  title: text("title"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Documents a user attaches to a conversation (client briefs, competitor decks).
 *  They supply context and parameters to the model, never facts: numbers read from
 *  a document are never cited as evidence. Base64 is stored as sent to the model. */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** null until the message that carries it creates the conversation */
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    mediaType: text("media_type").notNull(),
    bytes: integer("bytes").notNull(),
    /** base64 without newlines, as the Messages API document block expects */
    data: text("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("attachments_conversation_idx").on(t.conversationId),
    index("attachments_user_idx").on(t.userId, t.createdAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    contentJson: jsonb("content_json").notNull(),
    evidenceJson: jsonb("evidence_json"),
    skillRunIds: uuid("skill_run_ids").array(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").references(() => users.id),
    name: text("name").notNull(),
    /** 'analysis' (a skill on a schedule, diffed run to run) | 'weekly_report' (the Weekly Competitor Pulse deck; params hold its contract) */
    kind: text("kind").notNull().default("analysis"),
    skill: text("skill").notNull(),
    /** frozen params_resolved from the source run */
    params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
    fromSkillRunId: uuid("from_skill_run_id"),
    decisionId: uuid("decision_id").references(() => decisions.id, { onDelete: "set null" }),
    scheduleCron: text("schedule_cron").notNull(),
    scheduleTz: text("schedule_tz").notNull().default("Asia/Jakarta"),
    scheduleHuman: text("schedule_human"),
    delivery: jsonb("delivery").notNull().default(sql`'{"channels":["in_app"]}'::jsonb`),
    onlyIfChanged: boolean("only_if_changed").notNull().default(true),
    diffConfig: jsonb("diff_config").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("draft"),
    lastRunAt: ts("last_run_at"),
    nextRunAt: ts("next_run_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("agents_workspace_status_idx").on(t.workspaceId, t.status),
    check("agents_status_chk", sql`${t.status} in ('active','paused','draft')`),
    check("agents_kind_chk", sql`${t.kind} in ('analysis','weekly_report')`),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    skillRunId: uuid("skill_run_id").references(() => skillRuns.id),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    diff: jsonb("diff"),
    shouldDeliver: boolean("should_deliver"),
    deliveredAt: ts("delivered_at"),
    deliveryError: text("delivery_error"),
    reportId: uuid("report_id"),
  },
  (t) => [index("agent_runs_agent_started_idx").on(t.agentId, t.startedAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    title: text("title").notNull(),
    source: text("source").notNull(),
    skillRunId: uuid("skill_run_id").references(() => skillRuns.id, { onDelete: "set null" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    decisionId: uuid("decision_id").references(() => decisions.id, { onDelete: "set null" }),
    /** a version of a deck (Decks, 2 Oct 2026): one report per period it was made for */
    deckId: uuid("deck_id").references((): AnyPgColumn => decks.id, { onDelete: "cascade" }),
    bodyMd: text("body_md"),
    blocks: jsonb("blocks"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reports_workspace_created_idx").on(t.workspaceId, t.createdAt),
    check("reports_source_chk", sql`${t.source} in ('agent','ask','deck')`),
    index("reports_deck_idx").on(t.deckId, t.createdAt),
  ],
);

/** Files a report ships as (the weekly deck as .pptx and .pdf), base64 like attachments; downloads are scoped by workspace. */
export const reportFiles = pgTable(
  "report_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    reportId: uuid("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    filename: text("filename").notNull(),
    bytes: integer("bytes").notNull(),
    data: text("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("report_files_report_idx").on(t.reportId),
    check("report_files_format_chk", sql`${t.format} in ('pptx','pdf')`),
  ],
);

/**
 * Pulses (DECISIONS, 30 Sep 2026): boards a team builds for the situation in
 * front of it, from the same cards as the Dashboard or from answers pinned in
 * Chats. A Pulse belongs to a workspace and everyone on that team sees it.
 */
export const pulses = pgTable(
  "pulses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("pulses_workspace_idx").on(t.workspaceId, t.updatedAt)],
);

/** A card on a Pulse: a dashboard view with its own filters (config), or a pinned analysis (skill_run_id). */
export const pulseCards = pgTable(
  "pulse_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    pulseId: uuid("pulse_id").notNull().references(() => pulses.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title"),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    size: text("size").notNull().default("m"),
    position: integer("position").notNull().default(0),
    skillRunId: uuid("skill_run_id").references(() => skillRuns.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("pulse_cards_pulse_idx").on(t.pulseId, t.position),
    check("pulse_cards_kind_chk", sql`${t.kind} in ('kpi','rankings','trend','tiers','creators','content','tier_mix','products','posting','closeup','patterns','skill')`),
    check("pulse_cards_size_chk", sql`${t.size} in ('s','m','l')`),
  ],
);

/**
 * Decks (DECISIONS, 2 Oct 2026): slide decks a team builds from a template, from
 * scratch or from a conversation in Chats. The spec holds the brands, the grain
 * (week or month), the platforms and the slides; each version is a report for one
 * period with its .pptx and .pdf. A recurring deck makes the next version when a
 * new period of data lands. Pulses were folded in.
 */
export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    source: text("source").notNull().default("template"),
    template: text("template"),
    spec: jsonb("spec").notNull(),
    recurring: boolean("recurring").notNull().default(false),
    nextRunAt: ts("next_run_at"),
    lastPeriod: text("last_period"),
    lastError: text("last_error"),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("decks_workspace_idx").on(t.workspaceId, t.updatedAt),
    index("decks_due_idx").on(t.recurring, t.nextRunAt),
    check("decks_source_chk", sql`${t.source} in ('template','scratch','chat','pulse')`),
  ],
);

// ---------------------------------------------------------- connector (MCP)
/**
 * Claude, ChatGPT and other MCP clients connect through OAuth 2.1 (dynamic client
 * registration, PKCE). A token acts for one person in one workspace (the team they
 * chose on the consent screen); tokens and codes are stored as SHA-256 hashes only.
 */
export const mcpClients = pgTable("mcp_clients", {
  clientId: text("client_id").primaryKey(),
  clientName: text("client_name"),
  redirectUris: jsonb("redirect_uris").notNull(),
  createdAt: createdAt(),
});

export const mcpCodes = pgTable("mcp_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull().references(() => mcpClients.clientId, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accessHash: text("access_hash").notNull().unique(),
    refreshHash: text("refresh_hash").unique(),
    clientId: text("client_id").notNull().references(() => mcpClients.clientId, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    accessExpiresAt: ts("access_expires_at").notNull(),
    refreshExpiresAt: ts("refresh_expires_at"),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("mcp_tokens_user_idx").on(t.userId)],
);

export const mcpCalls = pgTable(
  "mcp_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id").notNull(),
    clientId: text("client_id"),
    tool: text("tool").notNull(),
    params: jsonb("params"),
    status: text("status").notNull(),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("mcp_calls_user_created_idx").on(t.userId, t.createdAt), index("mcp_calls_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

// ------------------------------------------------------------ role versions
/**
 * Roles as products (DECISIONS, 4 Oct 2026; CMS plan). A role version is Fair's: PR is
 * Chorus, Brand & KOL is Atlas, Social Media is Spark, each released as major.minor by
 * Refal or Rafli. Like mcp_clients it belongs to no workspace: it is the product, not
 * a client's data. Only one version per role is current (the latest released); a
 * rollback marks a release rolled back and the one before it is current again.
 */
export const roleVersions = pgTable(
  "role_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    codename: text("codename").notNull(),
    version: text("version").notNull(),
    status: text("status").notNull().default("draft"),
    /** the whole RoleModel (src/roles/model.ts) */
    spec: jsonb("spec").notNull(),
    releaseNote: text("release_note"),
    minAppVersion: text("min_app_version"),
    proposedBy: text("proposed_by"),
    releasedBy: text("released_by"),
    releasedAt: ts("released_at"),
    rolledBackBy: text("rolled_back_by"),
    rolledBackAt: ts("rolled_back_at"),
    /** a staged release: only these workspaces run it until it is released to everyone (null) */
    stageWorkspaces: text("stage_workspaces").array(),
    /** the test results the proposal carried (src/roles/tests.ts) */
    testSummary: jsonb("test_summary"),
    /** where the version came from (src/learning/outcomes.ts): insights, client creations, suggestions, as refs */
    origins: jsonb("origins"),
    /** the measures (src/learning/measures.ts) its before-and-after compares */
    measures: text("measures").array(),
    /** the last edit of a draft; tests must have run after it before it can be proposed */
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("role_versions_role_version_uq").on(t.role, t.version),
    index("role_versions_current_idx").on(t.role, t.status, t.releasedAt),
    check("role_versions_status_chk", sql`${t.status} in ('draft','proposed','released','rolled_back')`),
  ],
);

/**
 * A client's version of a role: only what the company changed, as dotted paths
 * (src/roles/policy.ts). One row per change set; the highest version is live. A
 * workspace follows the latest Fair release unless base_version pins one.
 */
export const companyVersions = pgTable(
  "company_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    role: text("role").notNull(),
    version: integer("version").notNull(),
    baseVersion: text("base_version"),
    overrides: jsonb("overrides").notNull().default(sql`'{}'::jsonb`),
    author: text("author"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("company_versions_uq").on(t.workspaceId, t.role, t.version)],
);

/** A person's own settings on a team; only member-editable fields (src/roles/policy.ts). */
export const personalSettings = pgTable(
  "personal_settings",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId, t.role] })],
);

/**
 * Every change to a role, a company version or a setting, from the CMS or the
 * product. Append-only. workspace_id is null for a change to Fair's own roles.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id"),
    actor: text("actor").notNull(),
    area: text("area").notNull(),
    action: text("action").notNull(),
    path: text("path"),
    old: jsonb("old"),
    new: jsonb("new"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_ws_created_idx").on(t.workspaceId, t.createdAt), index("audit_log_area_idx").on(t.area, t.createdAt)],
);

/** Signals for the learning loop (CMS plan): whitelisted kinds, no text people typed, no numbers from the data. */
export const modelEvents = pgTable(
  "model_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull(),
    role: text("role").notNull(),
    userId: uuid("user_id"),
    roleVersion: text("role_version"),
    companyVersion: integer("company_version"),
    surface: text("surface").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    /** Fair staff acting in a client workspace: kept on its page, left out of the roll-ups */
    byStaff: boolean("by_staff").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("model_events_ws_created_idx").on(t.workspaceId, t.createdAt), index("model_events_role_kind_idx").on(t.role, t.kind, t.createdAt)],
);

/**
 * The nightly roll-up of signals (CMS plan, the learning loop): one sentence with its
 * counts per role and key, recomputed each day. Like role_versions it belongs to no
 * workspace: it holds only counts across workspaces, never a workspace's name, and a
 * cross-client insight exists only when at least three workspaces stand behind it.
 */
export const modelInsights = pgTable(
  "model_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    roleVersion: text("role_version"),
    /** what the insight is about, stable across days: setting:alert.crisis_multiple, tile_hidden:amplifiers, analysis:top-content… */
    key: text("key").notNull(),
    family: text("family").notNull(),
    sentence: text("sentence").notNull(),
    counts: jsonb("counts").notNull(),
    workspaces: integer("workspaces").notNull(),
    day: date("day").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("model_insights_uq").on(t.role, t.key, t.day), index("model_insights_role_day_idx").on(t.role, t.day)],
);

/**
 * Every model call with its tokens, by workspace and purpose (chat, deck, caption
 * reading, comment labelling…): the measured cost per action that credit prices will
 * come from. workspace_id is null for Fair's own calls.
 */
export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id"),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    cacheRead: integer("cache_read").notNull().default(0),
    cacheWrite: integer("cache_write").notNull().default(0),
    ref: text("ref"),
    createdAt: createdAt(),
  },
  (t) => [index("model_calls_ws_created_idx").on(t.workspaceId, t.createdAt), index("model_calls_purpose_idx").on(t.purpose, t.createdAt)],
);


// ------------------------------------------------------------- role lab
/**
 * Recipes (CMS plan, "Skills as recipes"): analyses as data over the query builder
 * (src/recipes/). scope is "fair" for Fair's library or a workspace id for a client's
 * own (phase 4); workspace_id is set for the latter. One row per version.
 */
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull().default("fair"),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    key: text("key").notNull(),
    version: integer("version").notNull().default(1),
    spec: jsonb("spec").notNull(),
    status: text("status").notNull().default("active"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("recipes_scope_key_version_uq").on(t.scope, t.key, t.version), check("recipes_status_chk", sql`${t.status} in ('active','retired')`)],
);

/** A role's test set (CMS plan, "What every role carries"): guards, screens and golden questions. */
export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    spec: jsonb("spec").notNull(),
    source: text("source").notNull().default("fair"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("test_cases_role_key_uq").on(t.role, t.key), check("test_cases_kind_chk", sql`${t.kind} in ('guard','screen','question')`)],
);

/** One result per case per run; a batch is one run of a role version's tests. workspace_id is the test workspace, null for guards. */
export const testRuns = pgTable(
  "test_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batch: uuid("batch").notNull(),
    role: text("role").notNull(),
    roleVersion: text("role_version").notNull(),
    caseKey: text("case_key").notNull(),
    workspaceId: text("workspace_id"),
    status: text("status").notNull(),
    detail: jsonb("detail").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index("test_runs_role_version_idx").on(t.role, t.roleVersion, t.createdAt), index("test_runs_batch_idx").on(t.batch)],
);

/** A Role Lab session: a role owner and the Lab's AI working on one draft. */
export const labSessions = pgTable(
  "lab_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    draftVersion: text("draft_version").notNull(),
    owner: text("owner").notNull(),
    messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
    tokens: integer("tokens").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("lab_sessions_role_idx").on(t.role, t.updatedAt)],
);

// ------------------------------------------------------------- the client side
/**
 * Everything a client makes on a team (CMS plan, "The client side"): company skills
 * (recipes over the query builder), deck templates, house rules, memory facts and
 * vocabulary. A Builder's creation is live at once; a Member's works for its maker and
 * waits for a Builder's approval before it reaches everyone. The maker and the approver
 * give its badge. A release never touches these rows.
 */
export const creations = pgTable(
  "creations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    role: text("role").notNull(),
    kind: text("kind").notNull(),
    /** skills and templates: the key they run under, unique among a team's live creations */
    key: text("key"),
    title: text("title").notNull(),
    spec: jsonb("spec").notNull(),
    status: text("status").notNull().default("draft"),
    makerUserId: uuid("maker_user_id"),
    makerEmail: text("maker_email").notNull(),
    makerName: text("maker_name"),
    approver: text("approver"),
    /** the Builder's note when sending back or rejecting */
    note: text("note"),
    decidedAt: ts("decided_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("creations_ws_role_idx").on(t.workspaceId, t.role, t.status),
    check("creations_kind_chk", sql`${t.kind} in ('skill','deck_template','rule','fact','term','extension')`),
    check("creations_status_chk", sql`${t.status} in ('draft','waiting','approved','sent_back','rejected','removed')`),
  ],
);

/** "Suggest to Fair": a client item a Builder sends to the role owners, seen in the CMS's Client creations. */
export const fairSuggestions = pgTable(
  "fair_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    role: text("role").notNull(),
    /** a creation (ref = its id) or a company setting (ref = its path, value = the company's value) */
    refKind: text("ref_kind").notNull(),
    ref: text("ref").notNull(),
    value: jsonb("value"),
    note: text("note"),
    byEmail: text("by_email").notNull(),
    status: text("status").notNull().default("new"),
    fairNote: text("fair_note"),
    fairBy: text("fair_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("fair_suggestions_status_idx").on(t.status, t.createdAt),
    check("fair_suggestions_ref_chk", sql`${t.refKind} in ('creation','setting')`),
    check("fair_suggestions_status_chk", sql`${t.status} in ('new','seen','adopted','declined')`),
  ],
);

// ------------------------------------------------------------- extensions and credits
/**
 * A client's own data on top of the core (CMS plan, "Client extensions"): a field on
 * creators, posts or comments with the values it may take (a Persona table: each persona
 * with what it means and how to recognise one). Values come from a file, keyword rules
 * computed in SQL, or CeMO reading each row. One workspace only; the core tables never change.
 */
export const extDefs = pgTable(
  "ext_defs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** a-z, 0-9 and _; queries name it ext_<key> */
    key: text("key").notNull(),
    name: text("name").notNull(),
    target: text("target").notNull(),
    /** [{ name, description?, hint? }] */
    values: jsonb("values").notNull(),
    source: text("source").notNull(),
    /** rule: { rules: [{ value, terms }] }; cemo: { guide, scope }; file: {} */
    spec: jsonb("spec").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("draft"),
    /** the creation that carries its approval and badge (src/company/creations.ts) */
    creationId: uuid("creation_id"),
    makerEmail: text("maker_email").notNull(),
    approver: text("approver"),
    /** rows in scope, credits to fill them now and a day after, from the sample */
    estimate: jsonb("estimate"),
    /** { done, total, credits } while filling */
    progress: jsonb("progress"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ext_defs_ws_key_uq").on(t.workspaceId, t.key),
    check("ext_defs_target_chk", sql`${t.target} in ('creator','post','comment')`),
    check("ext_defs_source_chk", sql`${t.source} in ('rule','file','cemo')`),
    check("ext_defs_status_chk", sql`${t.status} in ('draft','approved','filling','live','paused','removed')`),
  ],
);

/** One value per extension and core row (row_ref: the creator, post or comment id); value null = read, none fits. */
export const extValues = pgTable(
  "ext_values",
  {
    defId: uuid("def_id").notNull().references(() => extDefs.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    rowRef: text("row_ref").notNull(),
    value: text("value"),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.defId, t.rowRef] }), index("ext_values_def_value_idx").on(t.defId, t.value)],
);

/**
 * Every credit spent or added (CMS plan, "Credits and billing"): spends are negative, pools
 * and top-ups positive. Fair's real cost per workspace comes from model_calls; prices are
 * placeholders in src/config/credits.ts until a month of measured cost per action.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    accountEmail: text("account_email"),
    kind: text("kind").notNull(),
    credits: numeric("credits", { precision: 12, scale: 2 }).notNull(),
    ref: text("ref"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("credit_ledger_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

/** Long work in slices (CMS plan, "Jobs without pg-boss"): /api/cron/jobs claims one with locked_until and saves progress between slices. */
export const cmsJobs = pgTable(
  "cms_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    kind: text("kind").notNull(),
    params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("queued"),
    progress: jsonb("progress").notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    lockedUntil: ts("locked_until"),
    createdBy: text("created_by"),
    finishedAt: ts("finished_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("cms_jobs_status_idx").on(t.status, t.createdAt), check("cms_jobs_status_chk", sql`${t.status} in ('queued','running','done','failed','cancelled')`)],
);

// ------------------------------------------------------------- onboarding
/**
 * A brand's accounts (CMS plan, "Brands"): per platform or any ('*'). In a listening dump
 * the capture's brand rows are these handles, so they also decide which brand a captured
 * post belongs to; an owned handle makes its posts the brand's own.
 */
export const brandHandles = pgTable(
  "brand_handles",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default("*"),
    /** lowercased, without @ */
    handle: text("handle").notNull(),
    owned: boolean("owned").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.platform, t.handle] }), index("brand_handles_brand_idx").on(t.brandId)],
);

/**
 * Relevance terms (CMS plan, "Relevance"): a post counts for its brand when the brand
 * posted it, tags one of its accounts, or its caption names it. counts: a term at the start
 * of a word (case-insensitive; written in capitals it matches only in capitals, as a whole
 * word). never: a phrase that never counts ("go pay attention"), taken out before matching.
 */
export const brandTerms = pgTable(
  "brand_terms",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    mode: text("mode").notNull().default("counts"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.brandId, t.mode, t.term] }), check("brand_terms_mode_chk", sql`${t.mode} in ('counts','never')`)],
);

/**
 * Where a workspace's data comes from (CMS plan, "Data"): a Fair Listening dump today,
 * the daily sync later. config: the files stored (Vercel Blob or a local folder), the
 * sentiment map, the inspect report.
 */
export const dataSources = pgTable(
  "data_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    kind: text("kind").notNull().default("listening_dump"),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("data_sources_ws_idx").on(t.workspaceId)],
);

/**
 * Comments on a deck's slides (DECISIONS, 7 Oct 2026, "Teams build their own"): the team's notes on
 * one version's slide, and CeMO's replies when a comment mentions @CeMO, with the change it proposes
 * (src/decks/comments.ts). A version's comments go with the version.
 */
export const slideComments = pgTable(
  "slide_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    deckId: uuid("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
    reportId: uuid("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
    /** the slide's number in that version */
    slide: integer("slide").notNull(),
    /** "person" or "cemo" */
    author: text("author").notNull().default("person"),
    authorEmail: text("author_email"),
    authorName: text("author_name"),
    text: text("text").notNull(),
    /** CeMO's reply: the deck change it proposes (src/decks/changes.ts), shown as a card */
    proposal: jsonb("proposal"),
    createdAt: createdAt(),
  },
  (t) => [
    index("slide_comments_report_idx").on(t.reportId, t.slide),
    check("slide_comments_author_chk", sql`${t.author} in ('person','cemo')`),
  ],
);

// ------------------------------------------------------------------ staging
/**
 * Staging (DECISIONS, 10 Oct 2026, "Data architecture V1"): every load lands here first, in its own area of the same
 * database, mapped to our columns: one row per row the file gives (after the source's rules), never shown on a
 * screen. The checks read it (src/loader/checks.ts); a broken load is held here with its report, a clean one is
 * promoted to the core (src/loader/promote.ts). A load can be thrown away whole; rows are cleared 30 days after.
 */
export const staging = pgSchema("staging");

export const stagingLoads = staging.table(
  "loads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    /** the adapter: 'listening' (a Fair Listening dump) | 'beauty' (a quarterly export) | 'profile' (a case's exports) */
    source: text("source").notNull(),
    /** [{ raw_file_id, path, sha256, rows }]: the raw files this load read */
    files: jsonb("files").notNull().default(sql`'[]'::jsonb`),
    /** reading → staged → held | promoting → live; discarded (thrown away whole) | failed (an error, see error) */
    status: text("status").notNull().default("reading"),
    /** [{ key, label, outcome: 'pass' | 'hold' | 'warn' | 'info', detail, count }] */
    checks: jsonb("checks").notNull().default(sql`'[]'::jsonb`),
    /** what was read, mapped, merged and dropped per file, and what the promotion wrote */
    report: jsonb("report").notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    startedBy: text("started_by"),
    /** who let a held load in, or threw one away */
    decidedBy: text("decided_by"),
    createdAt: createdAt(),
    stagedAt: ts("staged_at"),
    decidedAt: ts("decided_at"),
    liveAt: ts("live_at"),
    clearedAt: ts("cleared_at"),
  },
  (t) => [
    index("staging_loads_ws_idx").on(t.workspaceId, t.createdAt),
    check("staging_loads_status_chk", sql`${t.status} in ('reading','staged','held','promoting','live','discarded','failed')`),
  ],
);

/** posts as the file gives them: one row per (platform, url, brand), today's post columns */
export const stagingPosts = staging.table(
  "posts",
  {
    loadId: uuid("load_id").notNull().references(() => stagingLoads.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    brandId: text("brand_id").notNull(),
    platformPostId: text("platform_post_id"),
    creatorHandle: text("creator_handle"),
    /** the handle that becomes a creator (null for the brand's own accounts) */
    creatorKey: text("creator_key"),
    source: text("source").notNull(),
    collection: text("collection").notNull(),
    accountType: text("account_type"),
    postedAt: ts("posted_at").notNull(),
    month: date("month").notNull(),
    caption: text("caption"),
    hashtags: text("hashtags").array(),
    taggedHandles: text("tagged_handles").array(),
    isPaid: boolean("is_paid"),
    hasCart: boolean("has_cart"),
    isReseller: boolean("is_reseller"),
    followersAtPost: integer("followers_at_post"),
    tier: text("tier"),
    universe: text("universe"),
    categoryBroad: text("category_broad"),
    productCategory: text("product_category"),
    contentFormat: text("content_format"),
    contentType: text("content_type"),
    productName: text("product_name"),
    productUrl: text("product_url"),
    price: numeric("price"),
    priceOriginal: numeric("price_original"),
    discountPercent: numeric("discount_percent"),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
    shares: integer("shares"),
    saves: integer("saves"),
    engagements: integer("engagements"),
    engagementsLc: integer("engagements_lc"),
    capturedDays: integer("captured_days"),
    relevant: boolean("relevant"),
    /** a post only known from its comments (profiles): written only when the post is not there yet */
    stub: boolean("stub").notNull().default(false),
    flags: text("flags").array(),
    /** when the source read these numbers (a dump's last snapshot, an export's time) */
    readAt: ts("read_at"),
    sourceFile: text("source_file"),
  },
  (t) => [uniqueIndex("staging_posts_uq").on(t.loadId, t.platform, t.url, t.brandId)],
);

/** a post's readings over time (listening dumps: day 0 to 30) */
export const stagingReadings = staging.table(
  "readings",
  {
    loadId: uuid("load_id").notNull().references(() => stagingLoads.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    brandId: text("brand_id").notNull(),
    dayN: smallint("day_n").notNull(),
    capturedAt: ts("captured_at").notNull(),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
    shares: integer("shares"),
    saves: integer("saves"),
  },
  (t) => [primaryKey({ columns: [t.loadId, t.platform, t.url, t.brandId, t.dayN] })],
);

export const stagingAccounts = staging.table(
  "accounts",
  {
    loadId: uuid("load_id").notNull().references(() => stagingLoads.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    followersLatest: integer("followers_latest"),
    tierLatest: text("tier_latest"),
    firstSeen: date("first_seen"),
    lastSeen: date("last_seen"),
  },
  (t) => [primaryKey({ columns: [t.loadId, t.platform, t.handle] })],
);

/** comments as the file gives them, with the labels a source sends (listening dumps arrive labelled) */
export const stagingComments = staging.table(
  "comments",
  {
    loadId: uuid("load_id").notNull().references(() => stagingLoads.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    brandId: text("brand_id").notNull(),
    platformCommentId: text("platform_comment_id").notNull(),
    authorHandle: text("author_handle"),
    authorHash: text("author_hash"),
    text: text("text"),
    postedAt: ts("posted_at"),
    likes: integer("likes"),
    views: bigint("views", { mode: "number" }),
    sentiment: text("sentiment"),
    sentimentSource: text("sentiment_source"),
    sentimentConfidence: numeric("sentiment_confidence"),
    sentimentDetail: text("sentiment_detail"),
    csat: smallint("csat"),
    theme: text("theme"),
    purchaseIntent: boolean("purchase_intent"),
    translation: text("translation"),
    topicId: text("topic_id"),
    flags: text("flags").array(),
    sourceFile: text("source_file"),
  },
  (t) => [uniqueIndex("staging_comments_uq").on(t.loadId, t.platformCommentId)],
);

/** captions that arrive apart from their posts (a url → text export): they fill only empty captions */
export const stagingCaptions = staging.table(
  "captions",
  {
    loadId: uuid("load_id").notNull().references(() => stagingLoads.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    caption: text("caption").notNull(),
    hashtags: text("hashtags").array(),
  },
  (t) => [primaryKey({ columns: [t.loadId, t.platform, t.url] })],
);

/** a listening dump's own topics */
export const stagingTopics = staging.table(
  "topics",
  {
    loadId: uuid("load_id").notNull().references(() => stagingLoads.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isCatchAll: boolean("is_catch_all").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.loadId, t.id] })],
);
