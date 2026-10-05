/** How a result's rows read as a table, for the thread, cards and server pages alike (no client code here). */
import type { ReactNode } from "react";
import { fmtDate, fmtNum } from "./format";

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "run_id"]);
const MAX_COLS = 9;

export function columnsOf(rows: Record<string, unknown>[]): string[] {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]).filter((k) => !HIDE.has(k));
  const prefer = ["brand_id", "brand_a", "brand_b", "hashtag", "theme", "label", "group", "product", "creator_handle", "url", "platform", "tier", "followers", "posts", "creators", "views", "engagements", "er_pct", "comment_rate_pct", "share_of_voice_pct", "cart_pct", "cart_share_pct", "in_wave", "multiple", "creators_now", "week", "stage", "share_of_posts_pct", "share_of_brand_posts_pct", "category_share_pct", "index_vs_category", "change_posts_pct", "brand_share_pct", "shared_tags", "cart_share_pct", "top_brand", "active", "peak_week", "brand_count", "consecutive_months", "months_active", "affiliate_accounts", "shared_creators", "jaccard", "views_per_1k", "posted_at", "last_post", "for_you"];
  const ordered = [...new Set([...prefer.filter((k) => keys.includes(k)), ...keys.filter((k) => !prefer.includes(k))])];
  return ordered.filter((k) => !["caption", "hashtags", "brands", "used_by", "shared_list", "months_active_list", "top_posts", "positive_pct", "negative_pct", "top_topics", "top_questions", "topics", "tier_mix", "shared_list", "only_focus", "only_other", "product_id", "product_url", "evidence_ids"].includes(k)).slice(0, MAX_COLS);
}

export function cellOf(k: string, v: unknown): ReactNode {
  if (v == null) return "–";
  if (k === "url" && typeof v === "string") return <a href={v} target="_blank" rel="noreferrer" className="linkbtn">open</a>;
  if (k === "creator_handle") return <b>@{String(v)}</b>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (/(_at|posted|last_post|first_post|week_from|week_to|first_seen|last_seen)$/.test(k) && typeof v === "string" && /\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v);
  if (typeof v === "number") return fmtNum(v);
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" && x ? JSON.stringify(x) : String(x))).join(", ") : "–";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

