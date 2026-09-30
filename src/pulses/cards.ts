/**
 * Pulse cards (DECISIONS, 30 Sep 2026). A card is either a Dashboard view with
 * its own filters (headline number, rankings, trend, tiers, creators, content)
 * or an analysis pinned from Chats. Config is checked here before it is stored,
 * and every number a card shows is read from the Dashboard's data layer (SQL),
 * or from the pinned analysis's stored result.
 */
import type { AskRef, PlatformFilter } from "../dashboard/askref";
import { PLATFORMS } from "../dashboard/askref";
import { brandHandles, buckets, content, rankings, tiers, topCreators, totals, trend, type ContentCard, type ContentSort, type CreatorRow, type Filters, type Kpis, type RankRow, type TierCard, type TrendSeries } from "../dashboard/data";
import { latestCompleteWeek, monthOf, parsePeriod, shiftPeriod, weekOf, type Period } from "../dashboard/period";
import { SkillDb } from "../skills/db";
import { CARD_KINDS, KIND_INFO, METRIC_LABEL, type CardConfig, type CardKind, type CardRow, type CardSize, type Metric } from "./kinds";
import { getSkill } from "../skills/registry";
import type { Context } from "../skills/params";
import type { ChartSpec, SkillResult } from "../skills/types";

export { CARD_KINDS, KIND_INFO, METRIC_LABEL };
export type { CardConfig, CardKind, CardRow, CardSize, Metric };

/** Keep only what a card of this kind understands; unknown brands and odd values fall back to defaults. */
export function cleanConfig(kind: CardKind, raw: unknown, knownBrands: Set<string>): CardConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const platform = (PLATFORMS as string[]).includes(String(o.platform)) ? (o.platform as PlatformFilter) : "all";
  const brands = Array.isArray(o.brands) ? [...new Set(o.brands.filter((b): b is string => typeof b === "string" && knownBrands.has(b)))].slice(0, 20) : [];
  const p = String(o.period ?? "latest-month");
  const period = p === "latest-month" || p === "latest-week" || parsePeriod(p) ? p : "latest-month";
  const c: CardConfig = { platform, brands, period };
  if (kind === "kpi") c.metric = (["posts", "views", "engagements", "er"] as string[]).includes(String(o.metric)) ? (o.metric as Metric) : "views";
  if (kind === "trend") c.metric = o.metric === "views" ? "views" : "posts";
  if (kind === "content") {
    c.sort = (["views", "engagement", "er"] as string[]).includes(String(o.sort)) ? (o.sort as ContentSort) : "views";
    c.q = typeof o.q === "string" ? o.q.trim().slice(0, 80) : "";
  }
  if (kind === "creators") c.by = o.by === "comments" ? "comments" : "views";
  if (kind === "rankings" || kind === "creators" || kind === "content") {
    const n = Number(o.limit);
    const max = kind === "content" ? 12 : kind === "creators" ? 10 : 25;
    c.limit = Number.isFinite(n) && n >= 3 ? Math.min(max, Math.round(n)) : kind === "content" ? 6 : kind === "creators" ? 8 : 10;
  }
  return c;
}

/** "latest-month" and "latest-week" move with the data; a fixed period stays put. */
export function resolvePeriod(period: string, asOf: string): Period {
  if (period === "latest-week") return weekOf(latestCompleteWeek(asOf));
  return parsePeriod(period) ?? monthOf(asOf);
}

export type CardData =
  | { kind: "kpi"; metric: Metric; now: number | null; prev: number | null; change: Kpis["change"]["posts"]; sub: string }
  | { kind: "rankings"; rows: RankRow[] }
  | { kind: "trend"; weeks: string[]; series: TrendSeries[]; chosen: "filter" | "top" }
  | { kind: "tiers"; tiers: TierCard[] }
  | { kind: "creators"; rows: CreatorRow[] }
  | { kind: "content"; cards: ContentCard[]; total: number }
  | { kind: "skill"; skill: string; title: string; status: string; message?: string; columns: string[]; rows: Record<string, unknown>[]; rows_total: number; chart: ChartSpec | null; window: { from: string; to: string } | null; ran_at: string | null }
  | { kind: "error"; message: string };

export type RenderedCard = CardRow & { data: CardData; scope: string; period: { key: string; label: string; prev: string }; ask: Omit<AskRef, "k"> };

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "used_by", "shared_list", "months_active_list", "top_posts", "caption", "hashtags", "top_topics", "top_questions", "topics", "url"]);

/** The table a pinned analysis shows: its first rows and up to six plain columns. */
export function skillTable(result: SkillResult, limit = 8): { columns: string[]; rows: Record<string, unknown>[] } {
  const rows = result.rows ?? [];
  const first = rows[0] ?? {};
  const columns = Object.keys(first).filter((k) => !HIDE.has(k) && (first[k] == null || typeof first[k] !== "object")).slice(0, 6);
  return { columns, rows: rows.slice(0, limit).map((r) => Object.fromEntries(columns.map((c) => [c, r[c]]))) };
}

const PLATFORM_LABEL: Record<PlatformFilter, string> = { all: "TikTok + Instagram", tiktok: "TikTok", instagram: "Instagram" };

/** Read one card's numbers. Cards on one page share the workspace context and the brand-handle list. */
export async function renderCard(card: CardRow, ctx: Context, shared: { handles?: Promise<string[]>; skillRun?: (id: string) => Promise<{ skill: string; result: SkillResult; created_at: string } | null> }): Promise<RenderedCard> {
  const period = resolvePeriod(card.config.period, ctx.asOf);
  const prev = shiftPeriod(period, -1);
  const f: Filters = { platform: card.config.platform, brands: card.config.brands, period };
  const names = new Map(ctx.brands.map((b) => [b.id, { name: b.name, is_client: b.is_client }]));
  const scope = card.kind === "skill" ? "" : [PLATFORM_LABEL[f.platform], period.label, f.brands.length ? (f.brands.length <= 3 ? f.brands.map((b) => names.get(b)?.name ?? b).join(", ") : `${f.brands.length} brands`) : "all brands"].join(" · ");
  const base = { ...card, scope, period: { key: period.key, label: period.label, prev: prev.label }, ask: { platform: f.platform, brands: f.brands, period: period.key } };
  const db = new SkillDb();
  try {
    switch (card.kind) {
      case "kpi": {
        const k = await totals(db, ctx, f, prev);
        const m = card.config.metric ?? "views";
        return { ...base, data: { kind: "kpi", metric: m, now: k.now[m], prev: k.prev[m], change: k.change[m], sub: m === "posts" ? `${k.now.creators.toLocaleString("en-US")} creators` : m === "views" ? `${Math.round(k.now.comments).toLocaleString("en-US")} comments` : m === "er" ? "Engagement ÷ views" : f.platform === "all" ? "Likes + comments" : "Platform-native" } };
      }
      case "rankings": {
        const { rows, periods } = await buckets(db, ctx, f);
        return { ...base, data: { kind: "rankings", rows: rankings(rows, periods, f, names).slice(0, card.config.limit ?? 10) } };
      }
      case "trend": {
        // with no brands picked, the line shows the brands with the most content, as on the Dashboard
        let ranked: RankRow[] = [];
        if (!f.brands.length) {
          const b = await buckets(db, ctx, f);
          ranked = rankings(b.rows, b.periods, f, names);
        }
        const t = await trend(db, ctx, f, ranked, names);
        return { ...base, data: { kind: "trend", ...t } };
      }
      case "tiers":
        return { ...base, data: { kind: "tiers", tiers: await tiers(db, ctx, f) } };
      case "creators": {
        const handles = await (shared.handles ?? brandHandles(db, ctx.workspaceId));
        const c = await topCreators(db, ctx, f, handles, undefined, card.config.limit ?? 8);
        return { ...base, data: { kind: "creators", rows: card.config.by === "comments" ? c.by_comments : c.by_views } };
      }
      case "content": {
        const c = await content(ctx, f, { sort: card.config.sort ?? "views", q: card.config.q ?? "", page: 0 });
        return { ...base, data: { kind: "content", cards: c.cards.slice(0, card.config.limit ?? 6), total: c.total } };
      }
      case "skill": {
        const run = card.skill_run_id && shared.skillRun ? await shared.skillRun(card.skill_run_id) : null;
        if (!run) return { ...base, data: { kind: "error", message: "The analysis behind this card is gone. Pin it again from Chats." } };
        const t = skillTable(run.result);
        return {
          ...base,
          data: {
            kind: "skill", skill: run.skill, title: getSkill(run.skill)?.title ?? "Analysis", status: run.result.status, message: run.result.message,
            columns: t.columns, rows: t.rows, rows_total: run.result.rows?.length ?? 0, chart: run.result.chart ?? null,
            window: run.result.meta?.data_window ?? null, ran_at: run.created_at,
          },
        };
      }
    }
  } catch (e) {
    return { ...base, data: { kind: "error", message: `This card could not load: ${(e as Error).message}` } };
  }
}
