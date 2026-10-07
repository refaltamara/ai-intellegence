/**
 * Findings pinned from Chats into a deck (Decks, DECISIONS 2 Oct 2026). A finding
 * keeps the analysis and the settings it ran with in Chats; each version of the
 * deck runs it again over the deck's period, so a recurring deck carries the
 * analysis forward. The rows are the skill's own; the slide only prints them.
 */
import type { Finding, FindingColumn } from "../competitor/types";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { getSkill } from "../skills/registry";
import { runSkill } from "../skills/runner";
import { brandLabel, type FindingSpec } from "./spec";
import { fairRecipes } from "../recipes/store";
import { runRecipe } from "../recipes/run";
import type { RecipeInput } from "../recipes/spec";
import { companyRecipeByKey } from "../company/creations";

/** Keys that are ids, lists or long text: kept in the rows, never shown as a column. */
const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "used_by", "shared_list", "months_active_list", "top_posts", "caption", "hashtags", "top_topics", "top_questions", "topics", "brand_ids", "platform_post_id", "rank", "pair_id", "campaign_id", "product_id", "product_url"]);
/** What a row is about, most telling first, and the measures worth a column, in that order. */
const NAMES = ["creator_handle", "hashtag", "label", "theme", "product", "product_name", "brand_id", "brand_a", "brand_b", "top_brand", "platform", "tier", "source", "content_format", "group"];
const MEASURES = ["views", "posts", "creators", "engagements", "er_pct", "share_of_posts_pct", "share_of_views_pct", "brand_share_pct", "followers", "avg_views", "median_views", "shared_creators", "shared_tags", "affiliate_accounts", "affiliate_posts", "cart_share_pct", "multiple", "change_posts_pct", "brand_count", "comment_rate_pct"];
const DATES = ["posted_at", "last_post", "last_seen", "first_seen", "first_post_at", "last_brand_post_at", "peak_week"];
const LABELS: Record<string, string> = {
  creator_handle: "Creator", brand_id: "Brand", brand_a: "Brand", brand_b: "With", top_brand: "Top brand", er_pct: "ER", comment_rate_pct: "Comment rate",
  share_of_posts_pct: "Share of posts", share_of_views_pct: "Share of views", brand_share_pct: "Brand share", cart_share_pct: "Cart share", change_posts_pct: "Posts change",
  posted_at: "Posted", last_post: "Last post", last_seen: "Last seen", first_seen: "First seen", url: "Post", content_format: "Format", brand_count: "Brands",
  count_comments: "Comments", count_posts: "Posts", count_commenters: "Commenters", count_creators: "Creators", negative_pct: "Negative", positive_pct: "Positive", net_sentiment: "Net sentiment", sum_likes: "Likes", sum_views: "Views", sum_engagements: "Engagements", sum_comments: "Comments on them",
};
const MAX_COLUMNS = 7;
const ROWS_KEPT = 10;

function formatOf(key: string, sample: unknown): FindingColumn["format"] {
  if (DATES.includes(key) || (/(_at|date)$/.test(key) && typeof sample === "string" && /^\d{4}-\d{2}-\d{2}/.test(sample))) return "date";
  if (typeof sample !== "number") return "text";
  if (/(pct$|(^|_)share(_|$)|rate$|^er$|_er$|percent)/.test(key)) return "pct";
  if (/(views|engagements|followers|reach|likes|plays|impressions)/.test(key)) return "compact";
  return Number.isInteger(sample) ? "int" : "num";
}

const label = (key: string) => LABELS[key] ?? (key.startsWith("ext_") ? key.slice(4).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null) ?? (key.replace(/_pct$/, "").replace(/_/g, " ").trim().replace(/^./, (c) => c.toUpperCase()));

/** The columns a slide shows: what each row is about, its measures, a date when there is room, the link last. */
export function findingColumns(rows: Record<string, unknown>[]): FindingColumn[] {
  const first = rows[0] ?? {};
  const scalar = Object.keys(first).filter((k) => !HIDE.has(k) && (first[k] == null || typeof first[k] !== "object"));
  const sample = (k: string) => rows.map((r) => r[k]).find((v) => v != null);
  const texts = scalar.filter((k) => typeof sample(k) === "string" && !DATES.includes(k) && k !== "url");
  const nums = scalar.filter((k) => typeof sample(k) === "number");
  // a theme's label already names it; the raw key would say it twice
  const named = texts.filter((k) => !(k === "theme" && texts.includes("label")));
  const names = [...NAMES.filter((k) => named.includes(k)), ...named.filter((k) => !NAMES.includes(k))].slice(0, 3);
  const hasUrl = scalar.includes("url");
  const room = MAX_COLUMNS - names.length - (hasUrl ? 1 : 0);
  const measures = [...MEASURES.filter((k) => nums.includes(k)), ...nums.filter((k) => !MEASURES.includes(k))].slice(0, Math.min(4, room));
  const date = DATES.find((k) => scalar.includes(k));
  const keys = [...names, ...measures, ...(date && names.length + measures.length < room ? [date] : []), ...(hasUrl ? ["url"] : [])];
  return keys.map((k) => ({ key: k, label: label(k), format: formatOf(k, sample(k)) }));
}

/** Rows as a slide prints them: brand slugs as brand names, handles with their @. */
function readable(rows: Record<string, unknown>[], brands: Map<string, string>): Record<string, unknown>[] {
  return rows.map((r) => {
    const o = { ...r };
    for (const k of ["brand_id", "brand_a", "brand_b", "top_brand"]) if (typeof o[k] === "string") o[k] = brands.get(o[k] as string) ?? o[k];
    if (typeof o.creator_handle === "string" && o.creator_handle && !o.creator_handle.startsWith("@")) o.creator_handle = `@${o.creator_handle}`;
    return o;
  });
}

/** A skill's settings moved to the deck's period: the window becomes the period; month and week pins are dropped. */
export function periodParams(skill: string, params: Record<string, unknown>, period: { from: string; to: string }): Record<string, unknown> {
  const def = getSkill(skill);
  const props = def?.input_schema.properties ?? {};
  const { month: _m, week: _w, window: _win, ...rest } = params;
  return { ...rest, ...("window" in props ? { window: { from: period.from, to: period.to } } : {}) };
}

/** Run each finding over the period; a finding that cannot run says why on its slide. */
export async function runFindings(specs: FindingSpec[], workspaceId: string, period: { from: string; to: string }): Promise<Finding[]> {
  const out: Finding[] = [];
  const brands = new Map((await loadContext(new SkillDb(), workspaceId)).brands.map((b) => [b.id, brandLabel(b.name)]));
  for (const f of specs) {
    const base = { key: f.key, title: f.title, question: f.question, columns: [] as FindingColumn[], rows: [] as Record<string, unknown>[], rows_total: 0, data_window: { from: period.from, to: period.to }, ...(f.after ? { after: f.after } : {}), ...(f.by ? { by: f.by } : {}) };
    if (f.skill.startsWith("recipe:")) {
      // one of Fair's recipes or the team's own skills, over the deck's period
      const key = f.skill.slice("recipe:".length);
      const recipe = (await fairRecipes()).get(key) ?? (await companyRecipeByKey(workspaceId, key));
      if (!recipe) { out.push({ ...base, status: "unavailable", message: "This analysis is no longer available." }); continue; }
      const res = await runRecipe(recipe, { ...(f.params as RecipeInput), window: { from: period.from, to: period.to } }, workspaceId);
      const status: Finding["status"] = res.status === "ok" ? (res.rows.length ? "ok" : "empty") : "error";
      const rows = readable(res.rows.slice(0, ROWS_KEPT), brands);
      out.push({ ...base, status, ...(status !== "ok" ? { message: status === "empty" ? `No rows for ${period.from} to ${period.to}.` : res.message ?? "The analysis could not run for this period." } : {}), columns: findingColumns(rows), rows, rows_total: res.rows.length });
      continue;
    }
    if (!getSkill(f.skill)) {
      out.push({ ...base, status: "unavailable", message: "This analysis is no longer available." });
      continue;
    }
    const res = await runSkill({ skill: f.skill, params: periodParams(f.skill, f.params, period), workspace_id: workspaceId, actor: { user_id: "deck", via: "agent" }, persist: false });
    const status: Finding["status"] = res.status === "ok" ? (res.rows.length ? "ok" : "empty") : res.status === "unavailable" ? "unavailable" : "error";
    const rows = readable(res.rows.slice(0, ROWS_KEPT), brands);
    out.push({
      ...base,
      status,
      ...(status !== "ok" ? { message: status === "empty" ? `No rows for ${period.from} to ${period.to}.` : res.message ?? "The analysis could not run for this period." } : {}),
      columns: findingColumns(rows),
      rows,
      rows_total: res.rows.length,
      data_window: res.meta.data_window?.from ? res.meta.data_window : base.data_window,
    });
  }
  return out;
}
