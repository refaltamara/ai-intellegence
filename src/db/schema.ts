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
    passwordHash: text("password_hash"),
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
    check("posts_platform_chk", sql`${t.platform} in ('tiktok','instagram','threads','x','youtube')`),
    check("posts_source_chk", sql`${t.source} in ('owned','earned')`),
    check("posts_tier_chk", sql`${t.tier} is null or ${t.tier} in ('nano','micro','mid','macro','mega')`),
    check("posts_stance_chk", sql`${t.stance} is null or ${t.stance} in ('positive','neutral','negative')`),
    index("posts_cap_pick_idx").on(t.workspaceId, t.capSource, t.postedAt),
  ],
);

/** Day-by-day tracking: listening workspaces only (etl/load_listening.py); the beauty exports carry one final capture per post. */
export const postSnapshots = pgTable(
  "post_snapshots",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    dayN: smallint("day_n").notNull(),
    capturedAt: ts("captured_at").notNull(),
    views: bigint("views", { mode: "number" }),
    likes: integer("likes"),
    commentsCount: integer("comments_count"),
    shares: integer("shares"),
    saves: integer("saves"),
  },
  // Listening workspaces track a post for up to 30 days (etl/load_listening.py).
  (t) => [primaryKey({ columns: [t.postId, t.dayN] }), check("post_snapshots_day_chk", sql`${t.dayN} between 0 and 30`)],
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
  /** display order; listening workspaces bring their own taxonomy (etl/load_listening.py) */
  sortOrder: integer("sort_order").notNull().default(0),
  /** the catch-all bucket ("Others") */
  isCatchAll: boolean("is_catch_all").notNull().default(false),
});

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
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
    classifiedAt: ts("classified_at"),
  },
  (t) => [
    uniqueIndex("comments_workspace_platform_comment_uq").on(t.workspaceId, t.platformCommentId),
    index("comments_post_idx").on(t.postId),
    index("comments_workspace_posted_idx").on(t.workspaceId, t.postedAt),
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
