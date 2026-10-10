/**
 * What each source writes to the core, and how: the columns the old loaders wrote, so a promotion writes what they
 * wrote (src/loader/promote.ts) and a comparison checks exactly that (src/loader/compare.ts).
 *   overwrite  a newer load replaces the value (Beauty exports, listening dumps: each is the whole picture)
 *   coalesce   a newer load fills a value it has and keeps the old one where it has none (profile exports arrive in
 *              batches whose columns differ: Kahf's 7 Oct posts file has no views or followers)
 */
import type { SourceKind } from "./types";

export const POST_WRITE: Record<SourceKind, { cols: string[]; mode: "overwrite" | "coalesce" }> = {
  beauty: {
    mode: "overwrite",
    cols: ["platform_post_id", "creator_handle", "source", "collection", "account_type", "posted_at", "month", "caption", "hashtags", "has_cart", "is_reseller",
      "followers_at_post", "tier", "universe", "category_broad", "product_category", "content_format", "content_type", "product_name", "product_url", "price",
      "price_original", "discount_percent", "views", "likes", "comments_count", "shares", "saves", "engagements", "engagements_lc", "source_file"],
  },
  listening: {
    mode: "overwrite",
    cols: ["platform_post_id", "creator_handle", "source", "collection", "posted_at", "month", "caption", "hashtags", "is_paid", "followers_at_post", "tier",
      "content_type", "views", "likes", "comments_count", "shares", "saves", "engagements", "engagements_lc", "captured_days", "relevant", "tagged_handles", "source_file"],
  },
  profile: {
    mode: "coalesce",
    cols: ["platform_post_id", "creator_handle", "source", "collection", "posted_at", "month", "caption", "hashtags", "followers_at_post", "tier", "content_type",
      "views", "likes", "comments_count", "shares", "engagements", "engagements_lc", "source_file"],
  },
};

/** the SQL type of each staged post column (jsonb_to_recordset and casts) */
export const POST_TYPES: Record<string, string> = {
  platform_post_id: "text", creator_handle: "text", source: "text", collection: "text", account_type: "text", posted_at: "timestamptz", month: "date",
  caption: "text", hashtags: "text[]", tagged_handles: "text[]", is_paid: "boolean", has_cart: "boolean", is_reseller: "boolean", followers_at_post: "int",
  tier: "text", universe: "text", category_broad: "text", product_category: "text", content_format: "text", content_type: "text", product_name: "text",
  product_url: "text", price: "numeric", price_original: "numeric", discount_percent: "numeric", views: "bigint", likes: "int", comments_count: "int",
  shares: "int", saves: "int", engagements: "int", engagements_lc: "int", captured_days: "int", relevant: "boolean", source_file: "text",
};

/** comment columns per source: listening comments arrive labelled and replace what is there; profile comments keep the model's label */
export const COMMENT_WRITE: Record<"listening" | "profile", string[]> = {
  listening: ["platform", "author_handle", "author_hash", "text", "posted_at", "likes", "sentiment", "sentiment_source", "sentiment_confidence", "sentiment_detail",
    "csat", "theme", "purchase_intent", "translation", "topic_id"],
  profile: ["platform", "author_handle", "author_hash", "text", "posted_at", "likes", "views", "sentiment", "sentiment_source"],
};
