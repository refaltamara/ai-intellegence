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
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const PLATFORMS = ["tiktok", "instagram", "threads", "x"] as const;
export const SOURCES = ["owned", "earned"] as const;
export const TIERS = ["nano", "micro", "mid", "macro", "mega"] as const;

// ---------------------------------------------------------------- workspace
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  clientBrandId: text("client_brand_id"),
  tz: text("tz").notNull().default("Asia/Jakarta"),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").notNull().default("member"),
    whatsappE164: text("whatsapp_e164"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_workspace_email_uq").on(t.workspaceId, t.email)],
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
    check("creators_platform_chk", sql`${t.platform} in ('tiktok','instagram','threads','x')`),
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
    check("posts_platform_chk", sql`${t.platform} in ('tiktok','instagram','threads','x')`),
    check("posts_source_chk", sql`${t.source} in ('owned','earned')`),
    check("posts_tier_chk", sql`${t.tier} is null or ${t.tier} in ('nano','micro','mid','macro','mega')`),
  ],
);

/** Day-by-day tracking (Phase 1b). Empty in v1: the exports have no snapshots. */
export const postSnapshots = pgTable(
  "post_snapshots",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    dayN: smallint("day_n").notNull(),
    capturedAt: ts("captured_at").notNull(),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
  },
  (t) => [primaryKey({ columns: [t.postId, t.dayN] }), check("post_snapshots_day_chk", sql`${t.dayN} between 0 and 7`)],
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
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  label: text("label").notNull(),
  parentId: text("parent_id"),
  /** 'objection' | 'question' | 'claim' | 'general' */
  kind: text("kind").notNull().default("general"),
});

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    platformCommentId: text("platform_comment_id").notNull(),
    authorHandle: text("author_handle"),
    /** sha256(platform || handle) for graph work */
    authorHash: text("author_hash"),
    text: text("text"),
    postedAt: ts("posted_at"),
    likes: integer("likes"),
    sentiment: text("sentiment"),
    topicId: text("topic_id").references(() => topics.id),
    topicConfidence: numeric("topic_confidence"),
    classifiedAt: ts("classified_at"),
  },
  (t) => [
    uniqueIndex("comments_workspace_platform_comment_uq").on(t.workspaceId, t.platformCommentId),
    index("comments_post_idx").on(t.postId),
    check("comments_sentiment_chk", sql`${t.sentiment} is null or ${t.sentiment} in ('positive','neutral','negative')`),
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
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("data_loads_workspace_started_idx").on(t.workspaceId, t.startedAt)],
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
    createdAt: createdAt(),
  },
  (t) => [index("skill_runs_workspace_created_idx").on(t.workspaceId, t.createdAt)],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").references(() => users.id),
  title: text("title"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

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
    skill: text("skill").notNull(),
    /** frozen params_resolved from the source run */
    params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
    fromSkillRunId: uuid("from_skill_run_id"),
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
    bodyMd: text("body_md"),
    blocks: jsonb("blocks"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reports_workspace_created_idx").on(t.workspaceId, t.createdAt),
    check("reports_source_chk", sql`${t.source} in ('agent','ask')`),
  ],
);
