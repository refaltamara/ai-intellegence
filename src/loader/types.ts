/**
 * The one loader's shapes (DECISIONS, 10 Oct 2026, "Data architecture V1"). An adapter turns a source's raw files
 * into these rows, mapped to our columns, one row per row the source gives after its rules; they land in staging
 * (src/db/schema.ts, schema "staging") before any check, and only a load that passes reaches the core.
 */
import type { Drops } from "./parse";
import type { RawFile } from "../raw/store";

export type SourceKind = "listening" | "beauty" | "profile";

export type StagedPost = {
  platform: string; url: string; brand_id: string; platform_post_id: string | null; creator_handle: string | null; creator_key: string | null;
  source: "owned" | "earned"; collection: string; account_type: string | null; posted_at: string; month: string; caption: string | null;
  hashtags: string[] | null; tagged_handles: string[] | null; is_paid: boolean | null; has_cart: boolean | null; is_reseller: boolean | null;
  followers_at_post: number | null; tier: string | null; universe: string | null; category_broad: string | null; product_category: string | null;
  content_format: string | null; content_type: string | null; product_name: string | null; product_url: string | null; price: number | null;
  price_original: number | null; discount_percent: number | null; views: number | null; likes: number | null; comments_count: number | null;
  shares: number | null; saves: number | null; engagements: number | null; engagements_lc: number | null; captured_days: number | null;
  relevant: boolean | null; stub: boolean; flags: string[] | null; source_file: string;
  /** when these numbers were read: a dump's latest reading, an export's time, else the day the file reached us */
  read_at?: string | null;
};

export type StagedReading = { platform: string; url: string; brand_id: string; day_n: number; captured_at: string; views: number | null; likes: number | null; comments_count: number | null; shares: number | null; saves: number | null };

export type StagedAccount = { platform: string; handle: string; display_name: string | null; followers_latest: number | null; tier_latest: string | null; first_seen: string | null; last_seen: string | null };

export type StagedComment = {
  platform: string; url: string; brand_id: string; platform_comment_id: string; author_handle: string | null; author_hash: string; text: string | null;
  posted_at: string | null; likes: number | null; views: number | null; sentiment: string | null; sentiment_source: string | null;
  sentiment_confidence: number | null; theme: string | null; purchase_intent: boolean | null;
  translation: string | null; topic_id: string | null; flags: string[] | null; source_file: string;
};

export type StagedCaption = { platform: string; url: string; caption: string; hashtags: string[] | null };
export type StagedTopic = { id: string; label: string; sort_order: number; is_catch_all: boolean };

/** what one file gave: every row it holds is staged, merged into another row, or dropped with a reason */
export type FileReport = {
  file: string; raw_file_id?: string | null; kind: "posts" | "comments" | "snapshots" | "captions" | "accounts" | "other"; platform: string | null;
  rows_in: number; staged: number; merged: number; dropped: number; drops: Drops; notes?: Record<string, unknown>;
};

export type Staged = {
  posts: StagedPost[]; readings: StagedReading[]; accounts: StagedAccount[]; comments: StagedComment[]; captions: StagedCaption[]; topics: StagedTopic[];
  files: FileReport[];
  /** source facts the checks and the promotion need (brand captures, the subject brand, the client) */
  facts: Record<string, unknown>;
};

export type AdapterInput = { workspace: string; tz: string; files: { raw: RawFile; bytes: Buffer }[]; options?: Record<string, unknown> };

export const emptyStaged = (): Staged => ({ posts: [], readings: [], accounts: [], comments: [], captions: [], topics: [], files: [], facts: {} });
