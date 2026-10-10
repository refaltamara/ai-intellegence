/**
 * The Brand & KOL dashboard (DECISIONS, 30 Sep 2026): the fixed view a category
 * team checks every day. One period (a month or a week) against the one before,
 * filtered by platform and brands. Every number is computed here in SQL; the page
 * only formats, and "Ask why" re-reads the same numbers from here.
 *
 * Every number is counted by a definition (src/definitions/catalog.ts; DECISIONS, 10 Oct 2026, step 4):
 * - Brand rows come from the daily totals and count links: a post about two brands counts for both. Totals
 *   (headline tiles, tiers, top creators, content) count each post once.
 * - Views are Views (day 7), with the latest beside them; a post that went up less than 7 days before the
 *   data's latest reading counts its latest reading so far, and its period says "so far".
 * - Share of views leads, with share of voice (posts) and share of engagement (comparable) beside it, each a
 *   brand's links over all panel brands' links, same platforms and period.
 * - Engagement is platform-native on one platform; across platforms it is likes + comments, the only
 *   definition they share.
 * - Engagement rate = engagement / views from the day-7 reading, over posts that can carry a rate: views over
 *   0 (a video reporting 0 views is out), engagement no more than views.
 * - A brand move is marked unusual with the weekly report's rule (src/competitor/flags.ts), judged per platform
 *   against the brand's own previous periods.
 */
import { evaluate } from "../competitor/flags";
import { sqlOf } from "../definitions/catalog";
import type { Flag, Metric, WeekPoint } from "../competitor/types";
import { weeklyRules } from "../config/weekly";
import { TIER_BANDS, tierForFollowers } from "../config/thresholds";
import { SkillDb } from "../skills/db";
import { loadContext, type Context } from "../skills/params";
import { PLATFORMS, PLATFORM_NAME, type PlatformFilter } from "./askref";
import { daysCovered, monthOf, parsePeriod, periodOptions, shiftPeriod, type Grain, type Period } from "./period";
import { panelPlatformsSql } from "../db/panel";

export type ContentSort = "views" | "engagement" | "er";
export type Filters = { platform: PlatformFilter; brands: string[]; period: Period };
export type ContentQuery = { sort: ContentSort; q: string; page: number };

export const CONTENT_PAGE = 24;
/** a post needs this many views before its engagement rate can rank it */
export const ER_MIN_VIEWS = 50_000;
/** a brand needs this much in the period before its engagement rate can rank it */
export const ER_MIN_POSTS = 30;
const HISTORY = 8;
const TREND_WEEKS = 12;
const TREND_BRANDS = 8;

/** views: Views (day 7); views_latest beside them; so_far: posts under 7 days old, counted at their latest reading so far */
export type Totals = { posts: number; creators: number; views: number; views_latest: number; so_far: number; engagements: number; comments: number; er: number | null };
export type Change = { pct: number | null; isNew: boolean } | null;
export type Kpis = { now: Totals; prev: Totals; change: Record<"posts" | "views" | "engagements" | "er", Change> };
export type RankFlag = { platform: string; metric: Metric; direction: "up" | "down"; change: number; unit: Flag["unit"] };
export type RankRow = {
  brand_id: string; name: string; is_client: boolean; platforms: string[];
  posts: number; creators: number; views: number; views_latest: number; so_far: number; engagements: number; comments: number; er: number | null; er_ranked: boolean;
  /** shares of the panel, in percent: views (day 7), posts, comparable engagement */
  share_views: number | null; share_voice: number | null; share_eng: number | null;
  prev: { posts: number; views: number } | null;
  views_change: Change; posts_change: Change;
  flags: RankFlag[];
};
export type TierCard = { tier: string; label: string; creators: number; share_pct: number | null; posts: number; posts_per_creator: number | null; views: number; engagements: number; er: number | null };
export type TrendSeries = { brand_id: string; name: string; posts: number[]; views: number[] };
export type CreatorRow = { creator_id: string; handle: string; platform: string; followers: number | null; tier: string | null; posts: number; views: number; comments: number; engagements: number; brands: string[]; profile_url: string | null };
/** views: Views (day 7), the latest so far while the post is under 7 days old (so_far); views_latest beside them */
export type ContentCard = { url: string; platform: string; handle: string | null; posted_at: string; caption: string; views: number | null; views_latest: number; so_far: boolean; engagements: number | null; comments: number; er: number | null; brands: string[] };
/** a brand's Views (day 7) in the period, split by who brought them (definition viewership_mix) */
export type MixRow = { brand_id: string; name: string; total: number; own: number; affiliators: number; creators: number };

export type DashboardData = {
  filters: { platform: PlatformFilter; brands: string[]; period: Period; prev: Period };
  options: { months: Period[]; weeks: Period[]; brands: { id: string; name: string }[]; platforms: string[] };
  as_of: string;
  coverage: { days: number; of: number };
  engagement_basis: "native" | "likes_comments";
  kpis: Kpis;
  rankings: RankRow[];
  tiers: TierCard[];
  trend: { weeks: string[]; series: TrendSeries[]; chosen: "filter" | "top" };
  creators: { by_views: CreatorRow[]; by_comments: CreatorRow[] };
  mix: MixRow[];
  caveats: string[];
};

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const ratio = (a: number, b: number): number | null => (b > 0 ? (a / b) * 100 : null);
export function change(now: number, prev: number | null | undefined): Change {
  if (prev == null) return null;
  if (prev === 0) return now > 0 ? { pct: null, isNew: true } : null;
  return { pct: ((now - prev) / prev) * 100, isNew: false };
}

/** Read the dashboard's filters from a URL; anything unknown falls back to the defaults. */
export function readFilters(sp: Record<string, string | string[] | undefined>, ctx: { asOf: string; brands: { id: string }[] }): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const platform = (PLATFORMS as string[]).includes(one("platform")) ? (one("platform") as PlatformFilter) : "all";
  const known = new Set(ctx.brands.map((b) => b.id));
  const brands = one("brands").split(",").map((s) => s.trim()).filter((b) => known.has(b)).slice(0, 20);
  const period = parsePeriod(one("period")) ?? monthOf(ctx.asOf);
  return { platform, brands, period };
}

export function readContentQuery(sp: Record<string, string | string[] | undefined>): ContentQuery {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const sort = (["views", "engagement", "er"] as string[]).includes(one("sort")) ? (one("sort") as ContentSort) : "views";
  const page = Math.max(0, Math.min(40, Number.parseInt(one("page"), 10) || 0));
  return { sort, q: one("q").trim().slice(0, 80), page };
}

/** The query string for a set of filters, so links keep them. */
export function filterQuery(f: { platform: PlatformFilter; brands: string[]; period: Period }, extra: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams();
  if (f.platform !== "all") q.set("platform", f.platform);
  if (f.brands.length) q.set("brands", f.brands.join(","));
  q.set("period", f.period.key);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "" && v !== 0) q.set(k, String(v));
  return q.toString();
}

/** Positional parameters for hand-built SQL: values are always bound, never spliced. */
export class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

/** The workspace, the platform (all = every platform the workspace holds), and only posts about their brand (DECISIONS 3 Oct 2026). */
export function scope(ws: string, f: { platform: PlatformFilter }, P: Params, alias = "p"): string {
  const platform = f.platform === "all" ? "" : ` and ${alias}.platform = ${P.add(f.platform)}`;
  return `${alias}.workspace_id = ${P.add(ws)}${platform} and ${alias}.relevant is not false and ${alias}.brought_in_by = 'panel'`;
}
export function inWindow(from: string, to: string, tz: string, P: Params, alias = "p"): string {
  const t = P.add(tz);
  return `${alias}.posted_at >= (${P.add(from)}::date::timestamp at time zone ${t}) and ${alias}.posted_at < ((${P.add(to)}::date + 1)::timestamp at time zone ${t})`;
}
export function brandFilter(brands: string[], P: Params, alias = "p"): string {
  return brands.length ? ` and ${alias}.brand_id = any(${P.add(brands)}::text[])` : "";
}

/** Handles that belong to the brands themselves, so a brand's own account never ranks as a creator. */
export async function brandHandles(db: SkillDb, ws: string): Promise<string[]> {
  const rows = await db.q<{ h: string }>(
    `select distinct lower(h) as h from (
       select tiktok_handle as h from brands where workspace_id = $1
       union all select instagram_handle from brands where workspace_id = $1
       union all select jsonb_array_elements_text(v) from brands, jsonb_each(owned_handles) as e(k, v) where workspace_id = $1 and jsonb_typeof(v) = 'array'
     ) x where h is not null and h <> ''`,
    [ws],
  );
  return rows.map((r) => r.h.replace(/^@/, ""));
}

type BucketRow = {
  brand_id: string; platform: string; bucket: string; posts: number; creators: number; views: number; eng: number; eng_lc: number; comments: number;
  d7_posts: number; so_far: number; d7_views: number; d7_eng: number; d7_eng_lc: number;
  n_rated: number; v_rated: number; e_rated: number; n_rated_lc: number; v_rated_lc: number; e_rated_lc: number;
};
const BUCKET_NUMS = ["posts", "creators", "views", "eng", "eng_lc", "comments", "d7_posts", "so_far", "d7_views", "d7_eng", "d7_eng_lc", "n_rated", "v_rated", "e_rated", "n_rated_lc", "v_rated_lc", "e_rated_lc"] as const;

/**
 * Every brand × platform × period over the lookback, from the daily totals (src/definitions/totals.ts): the rankings,
 * their shares, growth and flags come from here. Rates use the day-7 reading's rated sums (posts with views).
 */
export async function buckets(db: SkillDb, ctx: Context, f: Filters): Promise<{ rows: BucketRow[]; periods: Period[] }> {
  const periods = Array.from({ length: HISTORY + 1 }, (_, i) => shiftPeriod(f.period, i - HISTORY));
  const P = new Params();
  const grain = P.add(f.period.grain);
  const ws = P.add(ctx.workspaceId);
  const from = P.add(periods[0].from);
  const now = P.add(f.period.from);
  const to = P.add(f.period.to);
  const platform = f.platform === "all" ? "" : ` and platform = ${P.add(f.platform)}`;
  const rows = await db.q<BucketRow>(
    `with t as (
       select brand_id, platform, to_char(date_trunc(${grain}, day), 'YYYY-MM-DD') as bucket,
              sum(posts)::int as posts, sum(views)::float8 as views, sum(engagement)::float8 as eng, sum(engagement_lc)::float8 as eng_lc,
              sum(comments)::float8 as comments, sum(d7_posts)::int as d7_posts, sum(so_far_posts)::int as so_far, sum(d7_views)::float8 as d7_views,
              sum(d7_engagement)::float8 as d7_eng, sum(d7_engagement_lc)::float8 as d7_eng_lc,
              sum(d7_rated_posts)::int as n_rated, sum(d7_rated_views)::float8 as v_rated, sum(d7_rated_engagement)::float8 as e_rated,
              sum(d7_rated_lc_posts)::int as n_rated_lc, sum(d7_rated_lc_views)::float8 as v_rated_lc, sum(d7_rated_lc_engagement)::float8 as e_rated_lc
         from daily_totals where workspace_id = ${ws} and brand_id <> '*' and day >= ${from}::date and day <= ${to}::date${platform}
        group by 1, 2, 3
     ), c as (
       -- distinct creators for the period shown only: the history needs posts, views and rates
       select brand_id, platform, to_char(date_trunc(${grain}, day), 'YYYY-MM-DD') as bucket, count(distinct creator_id)::int as creators
         from daily_creators where workspace_id = ${ws} and day >= ${now}::date and day <= ${to}::date${platform}
        group by 1, 2, 3
     )
     select t.*, coalesce(c.creators, 0)::int as creators from t left join c using (brand_id, platform, bucket)`,
    P.values,
  );
  return { rows: rows.map((x) => ({ ...x, ...Object.fromEntries(BUCKET_NUMS.map((k) => [k, num(x[k])])) }) as BucketRow), periods };
}

/** The weekly report's point for one brand on one platform in one period, with its share of the panel (views at day 7). */
function point(key: string, row: BucketRow | undefined, panel: Panel | undefined): WeekPoint {
  const posts = row?.posts ?? 0;
  const views = row?.d7_views ?? 0;
  return {
    week: key, posts, creators: row?.creators ?? 0, owned_posts: 0, views, owned_views: 0,
    posts_rated: row?.n_rated ?? 0, views_rated: row?.v_rated ?? 0, engagements: row?.e_rated ?? 0, cart_posts: 0, cart_known: 0,
    er: row && row.v_rated > 0 ? (row.e_rated / row.v_rated) * 100 : null,
    posts_share: panel && panel.posts > 0 ? (posts / panel.posts) * 100 : null,
    views_share: panel && panel.views > 0 ? (views / panel.views) * 100 : null,
  };
}

/** the panel: every brand's links on one platform in one period (posts, views at day 7, comparable engagement) */
type Panel = { posts: number; views: number; eng_lc: number };

export function rankings(rows: BucketRow[], periods: Period[], f: Filters, names: Map<string, { name: string; is_client: boolean }>): RankRow[] {
  const now = periods[periods.length - 1].from;
  const prevKey = periods[periods.length - 2]?.from;
  const panel = new Map<string, Panel>();
  for (const r of rows) {
    const k = `${r.platform}|${r.bucket}`;
    const t = panel.get(k) ?? { posts: 0, views: 0, eng_lc: 0 };
    t.posts += r.posts;
    t.views += r.d7_views;
    t.eng_lc += r.eng_lc;
    panel.set(k, t);
  }
  // the shares' denominators: every brand on the platforms shown, this period
  const whole = [...panel.entries()].filter(([k]) => k.endsWith(`|${now}`)).reduce((a, [, t]) => ({ posts: a.posts + t.posts, views: a.views + t.views, eng_lc: a.eng_lc + t.eng_lc }), { posts: 0, views: 0, eng_lc: 0 });
  const byBrand = new Map<string, BucketRow[]>();
  for (const r of rows) {
    if (f.brands.length && !f.brands.includes(r.brand_id)) continue;
    const list = byBrand.get(r.brand_id) ?? [];
    list.push(r);
    byBrand.set(r.brand_id, list);
  }
  const rules = weeklyRules();
  const lc = f.platform === "all";
  const out: RankRow[] = [];
  for (const [brandId, list] of byBrand) {
    const cur = list.filter((r) => r.bucket === now);
    if (!cur.length) continue;
    const prev = list.filter((r) => r.bucket === prevKey);
    const sum = (xs: BucketRow[], k: keyof BucketRow) => xs.reduce((a, x) => a + (x[k] as number), 0);
    const posts = sum(cur, "posts");
    const views = sum(cur, "d7_views");
    const vr = sum(cur, lc ? "v_rated_lc" : "v_rated");
    const er = ratio(sum(cur, lc ? "e_rated_lc" : "e_rated"), vr);
    const prevPosts = prev.length ? sum(prev, "posts") : 0;
    const prevViews = prev.length ? sum(prev, "d7_views") : 0;
    const hadHistory = list.some((r) => r.bucket < now);
    const flags: RankFlag[] = [];
    for (const platform of [...new Set(list.map((r) => r.platform))]) {
      const series = periods.map((p) => point(p.from, list.find((r) => r.platform === platform && r.bucket === p.from), panel.get(`${platform}|${p.from}`)));
      const current = series.pop()!;
      for (const metric of ["posts", "views", "er"] as Metric[]) {
        const e = evaluate(metric, series, current, rules);
        if (e.flag) flags.push({ platform, metric, direction: e.flag.direction, change: e.flag.change, unit: e.flag.unit });
      }
    }
    const meta = names.get(brandId);
    out.push({
      brand_id: brandId, name: meta?.name ?? brandId, is_client: meta?.is_client ?? false,
      platforms: [...new Set(cur.map((r) => r.platform))].sort(),
      posts, creators: sum(cur, "creators"), views, views_latest: sum(cur, "views"), so_far: sum(cur, "so_far"),
      engagements: sum(cur, lc ? "eng_lc" : "eng"), comments: sum(cur, "comments"),
      er, er_ranked: posts >= ER_MIN_POSTS && er != null,
      share_views: ratio(views, whole.views), share_voice: ratio(posts, whole.posts), share_eng: ratio(sum(cur, "eng_lc"), whole.eng_lc),
      prev: hadHistory ? { posts: prevPosts, views: prevViews } : null,
      views_change: hadHistory ? change(views, prevViews) : null,
      posts_change: hadHistory ? change(posts, prevPosts) : null,
      flags,
    });
  }
  return out.sort((a, b) => b.views - a.views || b.posts - a.posts);
}

type TotalsRow = { bucket: string; posts: number; creators: number; views: number; views_latest: number; so_far: number; eng: number; comments: number; v_rated: number; e_rated: number };

/** The headline numbers of one period: views at day 7 with the latest beside them, the rate from the day-7 reading. */
function pickTotals(rows: TotalsRow[], from: string): Totals {
  const r = rows.find((x) => x.bucket === from);
  return r
    ? { posts: num(r.posts), creators: num(r.creators), views: num(r.views), views_latest: num(r.views_latest), so_far: num(r.so_far), engagements: num(r.eng), comments: num(r.comments), er: ratio(num(r.e_rated), num(r.v_rated)) }
    : { posts: 0, creators: 0, views: 0, views_latest: 0, so_far: 0, engagements: 0, comments: 0, er: null };
}

/** Headline totals of the whole panel, each post once: the daily totals' panel rows (brand '*') and creator days. */
export async function panelTotals(db: SkillDb, ctx: Context, f: Filters, prev: Period): Promise<TotalsRow[]> {
  const P = new Params();
  const lc = f.platform === "all";
  const grain = P.add(f.period.grain);
  const ws = P.add(ctx.workspaceId);
  const from = P.add(prev.from);
  const to = P.add(f.period.to);
  const platform = f.platform === "all" ? "" : ` and platform = ${P.add(f.platform)}`;
  return db.q<TotalsRow>(
    `with t as (
       select to_char(date_trunc(${grain}, day), 'YYYY-MM-DD') as bucket, sum(posts)::int as posts, sum(d7_views)::float8 as views, sum(views)::float8 as views_latest,
              sum(so_far_posts)::int as so_far, sum(${lc ? "engagement_lc" : "engagement"})::float8 as eng, sum(comments)::float8 as comments,
              sum(${lc ? "d7_rated_lc_views" : "d7_rated_views"})::float8 as v_rated, sum(${lc ? "d7_rated_lc_engagement" : "d7_rated_engagement"})::float8 as e_rated
         from daily_totals where workspace_id = ${ws} and brand_id = '*' and day >= ${from}::date and day <= ${to}::date${platform}
        group by 1
     ), c as (
       select to_char(date_trunc(${grain}, day), 'YYYY-MM-DD') as bucket, count(distinct creator_id)::int as creators
         from daily_creators where workspace_id = ${ws} and day >= ${from}::date and day <= ${to}::date${platform}
        group by 1
     )
     select t.*, coalesce(c.creators, 0)::int as creators from t left join c using (bucket)`,
    P.values,
  );
}

/** Headline totals of the brands chosen, each post once (a post about two of them counts once). */
export async function chosenTotals(db: SkillDb, ctx: Context, f: Filters, prev: Period): Promise<TotalsRow[]> {
  const P = new Params();
  const lc = f.platform === "all";
  const grain = P.add(f.period.grain);
  const tz = P.add(ctx.tz);
  const where = `${scope(ctx.workspaceId, f, P)} and ${inWindow(prev.from, f.period.to, ctx.tz, P)}${brandFilter(f.brands, P)}`;
  const eng = (x: string) => sqlOf(lc ? "engagement_lc" : "engagement", x);
  return db.q<TotalsRow>(
    `with l as (
       select p.item_id, bool_or(p.source = 'earned') as earned from posts p where ${where} group by p.item_id
     ), d as (
       select to_char(date_trunc(${grain}, i.posted_at at time zone ${tz}), 'YYYY-MM-DD') as bucket, i.creator_id, l.earned, i.views as latest, ${eng("i")} as eng,
              i.comments_count, coalesce(dd.so_far, false) as so_far, dd.views as d7_views, ${eng("dd")} as d7_eng,
              ${sqlOf(lc ? "engagement_rate_lc" : "engagement_rate", "dd")} as is_rated
         from l join post_items i on i.id = l.item_id left join post_d7 dd on dd.item_id = i.id
     )
     select bucket, count(*)::int as posts, count(distinct creator_id) filter (where earned)::int as creators,
            coalesce(sum(d7_views), 0)::float8 as views, coalesce(sum(latest), 0)::float8 as views_latest, count(*) filter (where so_far)::int as so_far,
            coalesce(sum(eng), 0)::float8 as eng, coalesce(sum(comments_count), 0)::float8 as comments,
            coalesce(sum(d7_views) filter (where is_rated), 0)::float8 as v_rated, coalesce(sum(d7_eng) filter (where is_rated), 0)::float8 as e_rated
       from d group by 1`,
    P.values,
  );
}

/** Headline totals for the period and the one before, each post counted once. */
export async function totals(db: SkillDb, ctx: Context, f: Filters, prev: Period): Promise<Kpis> {
  const rows = f.brands.length ? await chosenTotals(db, ctx, f, prev) : await panelTotals(db, ctx, f, prev);
  const now = pickTotals(rows, f.period.from);
  const before = pickTotals(rows, prev.from);
  const hasPrev = rows.some((x) => x.bucket === prev.from);
  return {
    now,
    prev: before,
    change: {
      posts: hasPrev ? change(now.posts, before.posts) : null,
      views: hasPrev ? change(now.views, before.views) : null,
      engagements: hasPrev ? change(now.engagements, before.engagements) : null,
      er: hasPrev && now.er != null && before.er != null ? { pct: now.er - before.er, isNew: false } : null,
    },
  };
}

/** Creator tiers in the period: creators, posts and views at day 7 per band (earned posts by creators only, each post once). */
export async function tiers(db: SkillDb, ctx: Context, f: Filters): Promise<TierCard[]> {
  const P = new Params();
  const lc = f.platform === "all";
  const eng = (x: string) => sqlOf(lc ? "engagement_lc" : "engagement", x);
  const where = `${scope(ctx.workspaceId, f, P)} and ${inWindow(f.period.from, f.period.to, ctx.tz, P)}${brandFilter(f.brands, P)} and p.creator_id is not null and p.tier is not null`;
  const rows = await db.q<{ tier: string; creators: number; posts: number; views: number; eng: number; v_rated: number; e_rated: number }>(
    `with i as (
       -- a link carries its post's fields (migration 0036): one link per post, an earned one
       select distinct on (p.item_id) p.item_id, p.tier, p.creator_id, p.views, p.likes, p.comments_count, p.shares, p.saves, p.flags
         from posts p where ${where} and p.source = 'earned' order by p.item_id
     ), d as (
       select i.tier, i.creator_id, dd.views as d7_views, ${eng("i")} as eng, ${eng("dd")} as d7_eng,
              ${sqlOf(lc ? "engagement_rate_lc" : "engagement_rate", "dd")} as is_rated
         from i left join post_d7 dd on dd.item_id = i.item_id
     )
     select tier, count(distinct creator_id)::int as creators, count(*)::int as posts,
            coalesce(sum(d7_views), 0)::float8 as views, coalesce(sum(eng), 0)::float8 as eng,
            coalesce(sum(d7_views) filter (where is_rated), 0)::float8 as v_rated, coalesce(sum(d7_eng) filter (where is_rated), 0)::float8 as e_rated
     from d group by tier`,
    P.values,
  );
  const total = rows.reduce((a, r) => a + num(r.creators), 0);
  return TIER_BANDS.map((b) => {
    const r = rows.find((x) => x.tier === b.tier);
    const creators = num(r?.creators);
    const posts = num(r?.posts);
    return { tier: b.tier, label: b.label, creators, share_pct: ratio(creators, total), posts, posts_per_creator: creators ? posts / creators : null, views: num(r?.views), engagements: num(r?.eng), er: ratio(num(r?.e_rated), num(r?.v_rated)) };
  });
}

/** Posts per brand per week for the twelve weeks up to the period's end (daily totals): the brands filtered, or the biggest eight. */
export async function trend(db: SkillDb, ctx: Context, f: Filters, ranked: RankRow[], names: Map<string, { name: string }>): Promise<DashboardData["trend"]> {
  // the last full week inside the period and the data, so the line never ends on a stub
  const end = new Date((f.period.to < ctx.asOf ? f.period.to : ctx.asOf) + "T00:00:00Z");
  const lastMonday = new Date(end);
  lastMonday.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7) - (end.getUTCDay() === 0 ? 0 : 7));
  const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const d = new Date(lastMonday);
    d.setUTCDate(d.getUTCDate() - 7 * (TREND_WEEKS - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const chosen = f.brands.length ? "filter" : "top";
  const ids = f.brands.length ? f.brands : ranked.slice().sort((a, b) => b.posts - a.posts).slice(0, TREND_BRANDS).map((r) => r.brand_id);
  if (!ids.length) return { weeks, series: [], chosen };
  const P = new Params();
  const sunday = new Date(lastMonday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const platform = f.platform === "all" ? "" : ` and platform = ${P.add(f.platform)}`;
  const rows = await db.q<{ brand_id: string; week: string; posts: number; views: number }>(
    `select brand_id, to_char(date_trunc('week', day), 'YYYY-MM-DD') as week, sum(posts)::int as posts, sum(d7_views)::float8 as views
       from daily_totals
      where workspace_id = ${P.add(ctx.workspaceId)} and brand_id = any(${P.add(ids)}::text[])
        and day >= ${P.add(weeks[0])}::date and day <= ${P.add(sunday.toISOString().slice(0, 10))}::date${platform}
      group by 1, 2`,
    P.values,
  );
  const series = ids.map((id) => ({
    brand_id: id,
    name: names.get(id)?.name ?? id,
    posts: weeks.map((w) => num(rows.find((r) => r.brand_id === id && r.week === w)?.posts)),
    views: weeks.map((w) => num(rows.find((r) => r.brand_id === id && r.week === w)?.views)),
  }));
  return { weeks, series, chosen };
}

/** Some captions arrive with emoji as literal "\\ud83e\\ude77" escapes; show the emoji. */
export function unescapeUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function profileUrl(platform: string, handle: string | null): string | null {
  if (!handle) return null;
  const h = handle.replace(/^@/, "");
  return platform === "tiktok" ? `https://www.tiktok.com/@${h}` : platform === "instagram" ? `https://www.instagram.com/${h}/` : platform === "threads" ? `https://www.threads.com/@${h}` : platform === "x" ? `https://x.com/${h}` : null;
}

type CreatorSql = { k: string; creator_id: string; platform: string; handle: string; followers: number | null; posts: number; views: number; comments: number; eng: number; brands_csv: string | null };

/** Creators by views (day 7) and by comments in the period (earned posts, brand accounts excluded, each post once). `only` narrows to one creator. */
export async function topCreators(db: SkillDb, ctx: Context, f: Filters, handles: string[], only?: string, limit = 10): Promise<{ by_views: CreatorRow[]; by_comments: CreatorRow[] }> {
  const P = new Params();
  const eng = sqlOf(f.platform === "all" ? "engagement_lc" : "engagement", "i");
  const where = `${scope(ctx.workspaceId, f, P)} and ${inWindow(f.period.from, f.period.to, ctx.tz, P)}${brandFilter(f.brands, P)} and p.source = 'earned'
    and p.creator_id is not null and lower(coalesce(p.creator_handle, '')) <> all(${P.add(handles)}::text[])${only ? ` and p.creator_id = ${P.add(only)}::uuid` : ""}`;
  const lim = P.add(limit);
  const rows = await db.q<CreatorSql>(
    `with i as (
       -- a link carries its post's fields (migration 0036): grouped by post, with the brands it is linked to
       select p.item_id, p.creator_id, p.platform, p.creator_handle, p.followers_at_post, p.likes, p.comments_count, p.shares, p.saves,
              string_agg(distinct p.brand_id, ',') as brands
         from posts p where ${where}
        group by p.item_id, p.creator_id, p.platform, p.creator_handle, p.followers_at_post, p.likes, p.comments_count, p.shares, p.saves
     ), u as (
       select i.creator_id, i.platform, i.creator_handle as handle, i.followers_at_post as followers, dd.views as views, i.comments_count as comments, ${eng} as eng, i.brands
         from i left join post_d7 dd on dd.item_id = i.item_id
     ), c as (
       select creator_id, platform, max(handle) as handle, max(followers) as followers, count(*)::int as posts,
              coalesce(sum(views), 0)::float8 as views, coalesce(sum(comments), 0)::float8 as comments, coalesce(sum(eng), 0)::float8 as eng,
              string_agg(brands, ',') as brands_csv
       from u group by creator_id, platform
     )
     (select 'views' as k, * from c order by views desc, posts desc limit ${lim})
     union all
     (select 'comments' as k, * from c order by comments desc, posts desc limit ${lim})`,
    P.values,
  );
  const shape = (r: CreatorSql): CreatorRow => {
    const followers = r.followers == null ? null : num(r.followers);
    const counts = new Map<string, number>();
    for (const b of (r.brands_csv ?? "").split(",").filter(Boolean)) counts.set(b, (counts.get(b) ?? 0) + 1);
    return {
      creator_id: r.creator_id, handle: r.handle, platform: r.platform, followers, tier: tierForFollowers(followers),
      posts: num(r.posts), views: num(r.views), comments: num(r.comments), engagements: num(r.eng),
      brands: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b),
      profile_url: profileUrl(r.platform, r.handle),
    };
  };
  return { by_views: rows.filter((r) => r.k === "views").map(shape), by_comments: rows.filter((r) => r.k === "comments").map(shape) };
}

/**
 * Posts in the period, each once, sorted by views (day 7, or the latest so far for posts under 7 days old), engagement or engagement rate
 * (from the day-7 reading, posts with views), with keyword or @username search. `url` narrows to one post.
 */
export async function content(ctx: Context, f: Filters, q: ContentQuery, url?: string): Promise<{ cards: ContentCard[]; total: number }> {
  const db = new SkillDb();
  const P = new Params();
  let where = `${scope(ctx.workspaceId, f, P)} and ${inWindow(f.period.from, f.period.to, ctx.tz, P)}${brandFilter(f.brands, P)}`;
  if (url) where += ` and p.url = ${P.add(url)}`;
  const term = q.q.replace(/[%_\\]/g, "");
  if (term.startsWith("@")) where += ` and p.creator_handle ilike ${P.add(`%${term.slice(1)}%`)}`;
  else if (term) where += ` and (p.caption ilike ${P.add(`%${term}%`)} or p.creator_handle ilike ${P.add(`%${term}%`)})`;
  const order = q.sort === "er"
    ? `(d7_eng / nullif(views, 0)) desc nulls last`
    : q.sort === "engagement" ? `engagements desc nulls last` : `views desc nulls last, latest desc nulls last`;
  const erOnly = q.sort === "er" ? ` where rated and views >= ${P.add(ER_MIN_VIEWS)}` : "";
  const lim = P.add(CONTENT_PAGE);
  const off = P.add(q.page * CONTENT_PAGE);
  const rows = await db.q<{ url: string; platform: string; handle: string | null; posted_at: string; caption: string | null; views: number | null; latest: number | null; engagements: number | null; comments: number | null; d7_eng: number | null; rated: boolean; so_far: boolean; brands: string; total: number }>(
    `with l as (
       select p.item_id, string_agg(distinct p.brand_id, ',') as brands from posts p where ${where} group by p.item_id
     ), i as (
       -- a link carries its post's fields (migration 0036): any one link of each post
       select distinct on (p.item_id) p.item_id, p.url, p.platform, p.creator_handle, p.posted_at, p.caption, p.views, p.likes, p.comments_count, p.shares, p.saves, p.flags
         from posts p join l on l.item_id = p.item_id order by p.item_id
     ), u as (
       select i.url, i.platform, i.creator_handle as handle, to_char(i.posted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as posted_at, left(i.caption, 400) as caption,
              dd.views::float8 as views, i.views::float8 as latest, (${sqlOf("engagement", "i")})::float8 as engagements, i.comments_count::float8 as comments,
              (${sqlOf("engagement", "dd")})::float8 as d7_eng, coalesce(${sqlOf("engagement_rate", "dd")}, false) as rated, coalesce(dd.so_far, false) as so_far, l.brands
         from i join l using (item_id) left join post_d7 dd on dd.item_id = i.item_id
     )
     select *, count(*) over ()::int as total from u${erOnly}
     order by ${order}, url
     limit ${lim} offset ${off}`,
    P.values,
  );
  return {
    total: num(rows[0]?.total),
    cards: rows.map((r) => {
      const views = r.views == null ? null : num(r.views);
      return {
        url: r.url, platform: r.platform, handle: r.handle, posted_at: r.posted_at, caption: unescapeUnicode(r.caption ?? "").replace(/\s+/g, " ").trim(),
        views, views_latest: num(r.latest), so_far: r.so_far, engagements: r.engagements == null ? null : num(r.engagements), comments: num(r.comments),
        er: r.rated && views ? (num(r.d7_eng) / views) * 100 : null,
        brands: (r.brands ?? "").split(",").filter(Boolean),
      };
    }),
  };
}

/**
 * The viewership mix (definition viewership_mix): each brand's Views (day 7) in the period from its own accounts, from
 * affiliators (creators with a cart post in the period, on any brand) and from other creators (the rest of its earned
 * views, unknown accounts included), from the daily totals and creator days.
 */
export async function mix(db: SkillDb, ctx: Context, f: Filters, names: Map<string, { name: string }>): Promise<MixRow[]> {
  const P = new Params();
  const ws = P.add(ctx.workspaceId);
  const from = P.add(f.period.from);
  const to = P.add(f.period.to);
  const platform = f.platform === "all" ? "" : ` and platform = ${P.add(f.platform)}`;
  const brands = f.brands.length ? ` and brand_id = any(${P.add(f.brands)}::text[])` : "";
  const rows = await db.q<{ brand_id: string; own: number; earned: number; affiliators: number }>(
    `with aff as (
       select creator_id from daily_creators where workspace_id = ${ws} and day >= ${from}::date and day <= ${to}::date${platform}
        group by creator_id having sum(cart_posts) > 0
     ), b as (
       select brand_id, coalesce(sum(d7_views) filter (where source = 'owned'), 0)::float8 as own, coalesce(sum(d7_views) filter (where source = 'earned'), 0)::float8 as earned
         from daily_totals where workspace_id = ${ws} and brand_id <> '*' and day >= ${from}::date and day <= ${to}::date${platform}${brands}
        group by brand_id
     ), a as (
       select c.brand_id, coalesce(sum(c.d7_views), 0)::float8 as affiliators
         from daily_creators c join aff using (creator_id)
        where c.workspace_id = ${ws} and c.day >= ${from}::date and c.day <= ${to}::date${platform.replace("platform", "c.platform")}
        group by c.brand_id
     )
     select b.brand_id, b.own, b.earned, coalesce(a.affiliators, 0)::float8 as affiliators from b left join a using (brand_id)`,
    P.values,
  );
  return rows
    .map((r) => {
      const own = num(r.own), aff = num(r.affiliators), earned = num(r.earned);
      return { brand_id: r.brand_id, name: names.get(r.brand_id)?.name ?? r.brand_id, total: own + earned, own, affiliators: aff, creators: Math.max(0, earned - aff) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Days with posts per platform in the period and the one before: a comparison with a partly captured period says so. */
async function capture(db: SkillDb, ctx: Context, f: Filters, prev: Period): Promise<{ platform: string; bucket: string; days: number; brands: number }[]> {
  const P = new Params();
  const grain = P.add(f.period.grain);
  const tz = P.add(ctx.tz);
  const where = `${scope(ctx.workspaceId, f, P)} and ${inWindow(prev.from, f.period.to, ctx.tz, P)}`;
  const rows = await db.q<{ platform: string; bucket: string; days: number; brands: number }>(
    `select p.platform, to_char(date_trunc(${grain}, p.posted_at at time zone ${tz}), 'YYYY-MM-DD') as bucket,
            count(distinct (p.posted_at at time zone ${tz})::date)::int as days, count(distinct p.brand_id)::int as brands
     from posts p where ${where} group by 1, 2`,
    P.values,
  );
  return rows.map((r) => ({ ...r, days: num(r.days), brands: num(r.brands) }));
}


export function caveatsFor(cap: { platform: string; bucket: string; days: number; brands: number }[], period: Period, prev: Period, cover: { days: number; of: number }): string[] {
  const out: string[] = [];
  const span = (p: Period) => Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86400000) + 1;
  if (cover.days < cover.of) out.push(`The data reaches ${cover.days} of ${cover.of} days of ${period.label}, so totals are not final.`);
  for (const platform of [...new Set(cap.map((c) => c.platform))]) {
    const now = cap.find((c) => c.platform === platform && c.bucket === period.from);
    const before = cap.find((c) => c.platform === platform && c.bucket === prev.from);
    const name = PLATFORM_NAME[platform] ?? platform;
    if (now && !before) out.push(`${name} has no data for ${prev.label}, so its changes show as new.`);
    if (before && before.days < span(prev) * 0.9) out.push(`${name} has posts on ${before.days} of ${span(prev)} days of ${prev.label}, so changes against it read high.`);
    if (now && before && Math.abs(now.brands - before.brands) >= Math.max(5, before.brands * 0.1)) out.push(`${name} tracked ${now.brands} brands in ${period.label} and ${before.brands} in ${prev.label}; panel totals move with the roster.`);
  }
  return out;
}

/** what "day 7" is in this period: posts under 7 days old count so far, said once */
export function dayCaveats(now: Totals): string[] {
  if (!now.posts || !now.so_far) return [];
  return [`${int(now.so_far)} of ${int(now.posts)} posts went up less than 7 days before the latest reading: they count their latest reading so far, so views at day 7 for this period will still grow.`];
}
const int = (n: number) => Math.round(n).toLocaleString("en-US");

export async function dashboardData(workspaceId: string, sp: Record<string, string | string[] | undefined>): Promise<DashboardData> {
  const db = new SkillDb();
  const ctx = await loadContext(db, workspaceId);
  const f = readFilters(sp, ctx);
  const prev = shiftPeriod(f.period, -1);
  const names = new Map(ctx.brands.map((b) => [b.id, { name: b.name, is_client: b.is_client }]));
  const [{ rows, periods }, kpis, tierCards, cap, handles, plats] = await Promise.all([
    buckets(db, ctx, f),
    totals(db, ctx, f, prev),
    tiers(db, ctx, f),
    capture(db, ctx, f, prev),
    brandHandles(db, workspaceId),
    db.q<{ platform: string }>(panelPlatformsSql("$1"), [workspaceId]),
  ]);
  const ranked = rankings(rows, periods, f, names);
  const [tr, creators, viewers] = await Promise.all([trend(db, ctx, f, ranked, names), topCreators(db, ctx, f, handles), mix(db, ctx, f, names)]);
  const cover = daysCovered(f.period, ctx.earliest, ctx.asOf);
  const opts = periodOptions(ctx.earliest, ctx.asOf);
  return {
    filters: { platform: f.platform, brands: f.brands, period: f.period, prev },
    options: { months: opts.months, weeks: opts.weeks, brands: ctx.brands.map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)), platforms: plats.map((r) => r.platform) },
    as_of: ctx.asOf,
    coverage: cover,
    engagement_basis: f.platform === "all" ? "likes_comments" : "native",
    kpis,
    rankings: ranked,
    tiers: tierCards,
    trend: tr,
    creators,
    mix: viewers,
    caveats: [...caveatsFor(cap, f.period, prev, cover), ...dayCaveats(kpis.now)],
  };
}

export { loadContext, PLATFORMS };
export type { PlatformFilter };
export type { Grain };
