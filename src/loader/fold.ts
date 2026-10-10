/**
 * One post, its brands (DECISIONS, 10 Oct 2026, "One row per real thing"). A post is one post_items row; each brand it
 * is about is a link (posts). This says which fields are about the post and how they are decided when a post's brand rows
 * disagree, because they were read at different times. The same rule folds the core's rows (backfillItems.ts) and a load's
 * staged rows (promote.ts, compare.ts), so loading the same files again changes nothing.
 */
import { POST_WRITE } from "./columns";
import type { SourceKind } from "./types";

/**
 * About the post: kept on post_items and copied onto each of its links by the triggers of migration 0036. Everything
 * else on posts is about the post and one brand: owned or earned, the collection, relevance, how we know (match), the
 * brand's universe and category, its product and price, a cart, a reseller.
 */
export const ITEM_COLS = [
  "platform_post_id", "creator_id", "creator_handle", "posted_at", "month", "caption", "hashtags", "tagged_handles", "is_paid",
  "followers_at_post", "tier", "content_format", "content_type", "views", "likes", "comments_count", "shares", "saves",
  "engagements", "engagements_lc", "captured_days", "stance", "stance_source", "topic_id", "topic_confidence", "voice",
  "cap_product", "cap_event", "cap_event_name", "cap_offer", "cap_hook", "cap_angle", "cap_source", "cap_read_at", "flags", "read_at",
] as const;
export type ItemCol = (typeof ITEM_COLS)[number];
export const isItemCol = (c: string): c is ItemCol => (ITEM_COLS as readonly string[]).includes(c);

/** the post fields a source writes: the old loaders' columns that are about the post, with its creator and flags */
export const itemColsOf = (source: SourceKind): ItemCol[] => ITEM_COLS.filter((c) => c === "creator_id" || c === "flags" || POST_WRITE[source].cols.includes(c));

/**
 * Which of a post's brand rows gives each field:
 *   reading   the numbers, from the reading with the most views (views only grow), then the latest, then the most likes
 *   creator   creator, followers and tier, from the row with the most followers
 *   time      the earliest time posted, and its month
 *   caption   the longest caption, and its hashtags
 *   stance    stance, topic and voice, from a row the model judged
 *   tags      the caption tags, from the latest reading of the caption
 * Ties go to the brand id, so a reload picks the same row. A row's flags follow the reading, except zero_followers, which
 * follows the creator row.
 */
const READING = "views desc nulls last, read_at desc nulls last, likes desc nulls last, brand_id";
const PICK = {
  reading: READING,
  creator: `followers_at_post desc nulls last, ${READING}`,
  time: `posted_at, ${READING}`,
  caption: `length(caption) desc nulls last, ${READING}`,
  stance: `(stance_source is null), ${READING}`,
  tags: `cap_read_at desc nulls last, (cap_source is null), ${READING}`,
} as const;
type Pick = keyof typeof PICK;

export const ITEM_PICK: Record<ItemCol, Pick> = {
  platform_post_id: "reading", creator_id: "creator", creator_handle: "creator", posted_at: "time", month: "time", caption: "caption",
  hashtags: "caption", tagged_handles: "reading", is_paid: "reading", followers_at_post: "creator", tier: "creator",
  content_format: "reading", content_type: "reading", views: "reading", likes: "reading", comments_count: "reading", shares: "reading",
  saves: "reading", engagements: "reading", engagements_lc: "reading", captured_days: "reading", stance: "stance", stance_source: "stance",
  topic_id: "stance", topic_confidence: "stance", voice: "stance", cap_product: "tags", cap_event: "tags", cap_event_name: "tags",
  cap_offer: "tags", cap_hook: "tags", cap_angle: "tags", cap_source: "tags", cap_read_at: "tags", flags: "reading", read_at: "reading",
};

export type FoldFrom = {
  /** the table the brand rows are in (posts, staging.posts), and which of its rows; `x` is an alias of the table */
  table: string;
  where: (x: string) => string;
  /** which posts to fold, when not all of them (a batch): applied to the rows the posts are grouped from */
  batch?: (x: string) => string;
  /** the post fields these rows carry */
  cols: readonly ItemCol[];
  /** the creator of a row, when the table has no creator_id (staged rows carry the handle) */
  creator?: (x: string) => string;
  /** more columns to take from the reading row (lineage) */
  carry?: string[];
};

/** one row per (platform, url) with each post field taken from its row: `platform, url, <cols>, <carry>` */
export function foldSql(f: FoldFrom): string {
  const picks = [...new Set<Pick>(["reading", ...f.cols.map((c) => ITEM_PICK[c]), ...(f.cols.includes("flags") ? ["creator" as const] : [])])];
  const keys = `select x.platform, x.url, ${picks.map((p) => `(array_agg(x.brand_id order by ${PICK[p]}))[1] as ${p}`).join(", ")}
    from ${f.table} x where ${f.where("x")}${f.batch ? ` and ${f.batch("x")}` : ""} group by x.platform, x.url`;
  const joins = picks.map((p) => `join ${f.table} g_${p} on g_${p}.platform = k.platform and g_${p}.url = k.url and g_${p}.brand_id = k.${p} and ${f.where(`g_${p}`)}`);
  const expr = (c: ItemCol) => {
    const g = `g_${ITEM_PICK[c]}`;
    if (c === "creator_id" && f.creator) return f.creator(g);
    if (c === "flags") {
      return `nullif(array(select v from unnest(g_reading.flags) v where v <> 'zero_followers' union select v from unnest(g_creator.flags) v where v = 'zero_followers' order by 1), '{}')`;
    }
    return `${g}.${c}`;
  };
  return `select k.platform, k.url, ${[...f.cols.map((c) => `${expr(c)} as ${c}`), ...(f.carry ?? []).map((c) => `g_reading.${c} as ${c}`)].join(", ")}
    from (${keys}) k ${joins.join(" ")}`;
}

/** how we know a link's post is about its brand, for links written before the loader said so: the collection that brought it */
export const MATCH_SQL = (x: string) => `case when ${x}.source = 'owned' then 'owned' when ${x}.collection = 'tagged' then 'tagged' else 'keyword' end`;
