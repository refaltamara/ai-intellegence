/**
 * Brand pages under Data (PRD-v2 §14): "what have you actually collected about
 * this brand?" Five sections, all inventory over the loaded posts: coverage,
 * creator tiers, posts over time, top creators, hashtags. Sounds are deferred.
 * Every number here is SQL; the page only formats. Windows are anchored on the
 * newest loaded post, like the skills, so "last 30 days" on a static export
 * returns June, not nothing.
 */
import { GENERIC_HASHTAGS } from "../config/hashtags";
import { DEFAULT_WORKSPACE_ID, TIER_BANDS } from "../config/thresholds";
import { SkillDb } from "../skills/db";
import { loadContext, type Context } from "../skills/params";

export type Period = "30d" | "90d" | "all";
export const PERIODS: { key: Period; label: string }[] = [{ key: "30d", label: "30 days" }, { key: "90d", label: "90 days" }, { key: "all", label: "All data" }];
const MIN_CREATORS_TO_COMPARE = 5;
const PARTIAL_DAYS = 15;
const WEEKS = 13;

export type Coverage = { platform: string; posts: number; creators: number; owned: number; earned: number; first: string; last: string; months: { month: string; posts: number; days: number; days_in_month: number; partial: boolean }[] };
export type TierRow = { tier: string; label: string; creators: number; posts: number; views: number; share_creators_pct: number | null; share_views_pct: number | null; median_views: number | null; er_pct: number | null; cart_pct: number | null; too_few: boolean };
export type WeekPoint = { week: string; platform: string; owned: number; earned: number; views: number; gap: boolean };
export type Growth = { platform: string; posts: number; prev_posts: number | null; views: number; prev_views: number | null; comparable: boolean };
export type CreatorRow = { creator_id: string; handle: string; platform: string; tier: string | null; followers: number | null; posts: number; views: number; er_pct: number | null; cart_pct: number | null; worked_for: string[]; for_client: string | null; sample_url: string | null };
export type HashtagRow = { hashtag: string; posts: number; creators: number; views: number; share_views_pct: number | null; prev_posts: number | null; is_brand: boolean };
export type BrandPageData = {
  brand: { id: string; name: string; is_client: boolean; tiktok_handle: string | null; instagram_handle: string | null; tracked_since: string | null; last_load: string | null };
  client: { id: string; name: string } | null;
  period: Period;
  window: { from: string; to: string };
  prior: { from: string; to: string } | null;
  coverage: Coverage[];
  tiers: TierRow[];
  weeks: WeekPoint[];
  growth: Growth[];
  creators: CreatorRow[];
  hashtags: HashtagRow[];
  names: Record<string, string>;
};

function addDays(iso: string, d: number): string {
  const x = new Date(iso + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 10000) / 100 : null);

export function resolvePeriod(period: Period, ctx: Context): { window: { from: string; to: string }; prior: { from: string; to: string } | null } {
  if (period === "all") return { window: { from: ctx.earliest, to: ctx.asOf }, prior: null };
  const n = period === "30d" ? 30 : 90;
  const from = addDays(ctx.asOf, -(n - 1));
  return { window: { from, to: ctx.asOf }, prior: { from: addDays(from, -n), to: addDays(from, -1) } };
}

/** Signed change for the "vs prior" cells; null when there is nothing to compare with. */
export function growthOf(now: number, prev: number | null, comparable: boolean): { delta: number; pct: number | null } | "no comparison" | "new" {
  if (!comparable) return "no comparison";
  if (prev == null || prev === 0) return now > 0 ? "new" : { delta: 0, pct: null };
  return { delta: now - prev, pct: Math.round(((now - prev) / prev) * 1000) / 10 };
}

/** Which weeks (Monday, workspace tz) fall in the last N weeks ending at as_of. */
export function weekStarts(asOf: string, n = WEEKS): string[] {
  const d = new Date(asOf + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const last = addDays(asOf, -dow);
  return Array.from({ length: n }, (_, i) => addDays(last, -7 * (n - 1 - i)));
}

export async function brandPage(brandId: string, period: Period, workspaceId = DEFAULT_WORKSPACE_ID): Promise<BrandPageData | null> {
  const db = new SkillDb();
  const ctx = await loadContext(db, workspaceId);
  const b = ctx.brands.find((x) => x.id === brandId);
  if (!b) return null;
  const { window, prior } = resolvePeriod(period, ctx);
  const tz = ctx.tz;
  const win = (alias: string, w: { from: string; to: string }, i: number) => `${alias}.posted_at >= ($${i}::date::timestamp at time zone $${i + 2}) and ${alias}.posted_at < (($${i + 1}::date + 1)::timestamp at time zone $${i + 2})`;
  const client = ctx.clientBrandId ? ctx.brands.find((x) => x.id === ctx.clientBrandId) ?? null : null;
  const names = Object.fromEntries(ctx.brands.map((x) => [x.id, x.name]));

  const [meta, cov, months, capture, tiers, weeksRaw, wsWeeks, growthRaw, creators, tagsCur, tagsPrev, tagTotal] = await Promise.all([
    db.one<{ tracked_since: string | null; last_load: string | null }>(
      `select (select to_char(min(posted_at at time zone $3), 'DD Mon YYYY') from posts where workspace_id = $1 and brand_id = $2) as tracked_since,
              (select to_char(max(finished_at) at time zone $3, 'DD Mon YYYY HH24:MI') from data_loads where workspace_id = $1) as last_load`,
      [workspaceId, brandId, tz],
    ),
    db.q<{ platform: string; posts: number; creators: number; owned: number; earned: number; first: string; last: string }>(
      `select platform, count(*)::int as posts, count(distinct creator_id)::int as creators,
              count(*) filter (where source = 'owned')::int as owned, count(*) filter (where source = 'earned')::int as earned,
              to_char(min(posted_at at time zone $3), 'DD Mon YYYY') as first, to_char(max(posted_at at time zone $3), 'DD Mon YYYY') as last
       from posts where workspace_id = $1 and brand_id = $2 group by 1 order by 1`,
      [workspaceId, brandId, tz],
    ),
    db.q<{ platform: string; month: string; posts: number }>(
      "select platform, to_char(month, 'YYYY-MM') as month, count(*)::int as posts from posts where workspace_id = $1 and brand_id = $2 group by 1, 2 order by 1, 2",
      [workspaceId, brandId],
    ),
    db.q<{ platform: string; month: string; days: number; days_in_month: number }>(
      `select platform, to_char(month, 'YYYY-MM') as month, count(distinct (posted_at at time zone $2)::date)::int as days,
              extract(day from (month + interval '1 month - 1 day'))::int as days_in_month
       from posts where workspace_id = $1 group by platform, month`,
      [workspaceId, tz],
    ),
    db.q<{ tier: string | null; creators: number; posts: number; views: number; median_views: number | null; engagements: number; tt_posts: number; cart_posts: number }>(
      `select tier, count(distinct creator_id)::int as creators, count(*)::int as posts, coalesce(sum(views), 0)::float8 as views,
              percentile_cont(0.5) within group (order by views)::float8 as median_views, coalesce(sum(engagements), 0)::float8 as engagements,
              count(*) filter (where platform = 'tiktok')::int as tt_posts, count(*) filter (where platform = 'tiktok' and has_cart)::int as cart_posts
       from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.source = 'earned' and p.creator_id is not null and ${win("p", window, 3)}
       group by tier`,
      [workspaceId, brandId, window.from, window.to, tz],
    ),
    db.q<{ platform: string; source: string; week_start: string; posts: number; views: number }>(
      "select platform, source, to_char(week_start, 'YYYY-MM-DD') as week_start, posts, views::float8 as views from mv_brand_week where workspace_id = $1 and brand_id = $2 and week_start >= $3::date",
      [workspaceId, brandId, weekStarts(ctx.asOf)[0]],
    ),
    db.q<{ platform: string; week_start: string }>(
      "select platform, to_char(week_start, 'YYYY-MM-DD') as week_start from mv_brand_week where workspace_id = $1 and week_start >= $2::date group by 1, 2",
      [workspaceId, weekStarts(ctx.asOf)[0]],
    ),
    db.q<{ platform: string; posts: number; views: number; prev_posts: number; prev_views: number; ws_prev_posts: number }>(
      prior
        ? `select pl.platform,
                  (select count(*)::int from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.platform = pl.platform and ${win("p", window, 3)}) as posts,
                  (select coalesce(sum(views), 0)::float8 from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.platform = pl.platform and ${win("p", window, 3)}) as views,
                  (select count(*)::int from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.platform = pl.platform and ${win("p", prior, 6)}) as prev_posts,
                  (select coalesce(sum(views), 0)::float8 from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.platform = pl.platform and ${win("p", prior, 6)}) as prev_views,
                  (select count(*)::int from posts p where p.workspace_id = $1 and p.platform = pl.platform and ${win("p", prior, 6)}) as ws_prev_posts
           from (select distinct platform from posts where workspace_id = $1 and brand_id = $2) pl order by 1`
        : `select pl.platform,
                  (select count(*)::int from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.platform = pl.platform and ${win("p", window, 3)}) as posts,
                  (select coalesce(sum(views), 0)::float8 from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.platform = pl.platform and ${win("p", window, 3)}) as views,
                  0::int as prev_posts, 0::float8 as prev_views, 0::int as ws_prev_posts
           from (select distinct platform from posts where workspace_id = $1 and brand_id = $2) pl order by 1`,
      prior ? [workspaceId, brandId, window.from, window.to, tz, prior.from, prior.to, tz] : [workspaceId, brandId, window.from, window.to, tz],
    ),
    db.q<CreatorRow>(
      `with base as (
         select p.creator_id, p.platform, p.views, p.engagements, p.has_cart, p.url
         from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.source = 'earned' and p.creator_id is not null and ${win("p", window, 3)}
       ), agg as (
         select creator_id, count(*)::int as posts, coalesce(sum(views), 0)::float8 as views,
                case when sum(views) > 0 then round((sum(engagements)::numeric / sum(views) * 100), 2)::float8 end as er_pct,
                case when bool_or(platform = 'tiktok') then round((count(*) filter (where has_cart))::numeric / count(*) * 100, 1)::float8 end as cart_pct,
                (array_agg(url order by views desc nulls last))[1] as sample_url
         from base group by creator_id
       )
       select c.id as creator_id, c.handle, c.platform, c.tier_latest as tier, c.followers_latest as followers, a.posts, a.views, a.er_pct, a.cart_pct, a.sample_url,
              coalesce((select array_agg(distinct x.brand_id order by x.brand_id) from posts x where x.workspace_id = $1 and x.creator_id = c.id and x.brand_id <> $2 and ${win("x", window, 3)}), '{}') as worked_for,
              ${client ? `(select to_char(max(x.posted_at at time zone $5), 'DD Mon YYYY') from posts x where x.workspace_id = $1 and x.creator_id = c.id and x.brand_id = $6)` : "null"} as for_client
       from agg a join creators c on c.id = a.creator_id
       order by a.views desc nulls last, a.posts desc limit 100`,
      client ? [workspaceId, brandId, window.from, window.to, tz, client.id] : [workspaceId, brandId, window.from, window.to, tz],
    ),
    db.q<{ hashtag: string; posts: number; creators: number; views: number }>(
      `with px as (
         select distinct on (p.platform, p.url) p.platform, p.url, p.creator_id, p.views, p.hashtags
         from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.hashtags is not null and cardinality(p.hashtags) > 0 and ${win("p", window, 3)}
         order by p.platform, p.url
       )
       select h as hashtag, count(*)::int as posts, count(distinct creator_id)::int as creators, coalesce(sum(views), 0)::float8 as views
       from px, unnest(px.hashtags) h where h <> all($6::text[]) group by h order by views desc nulls last, posts desc limit 160`,
      [workspaceId, brandId, window.from, window.to, tz, GENERIC_HASHTAGS],
    ),
    prior
      ? db.q<{ hashtag: string; posts: number }>(
          `with px as (
             select distinct on (p.platform, p.url) p.platform, p.url, p.hashtags
             from posts p where p.workspace_id = $1 and p.brand_id = $2 and p.hashtags is not null and cardinality(p.hashtags) > 0 and ${win("p", prior, 3)}
             order by p.platform, p.url
           )
           select h as hashtag, count(*)::int as posts from px, unnest(px.hashtags) h group by h`,
          [workspaceId, brandId, prior.from, prior.to, tz],
        )
      : Promise.resolve([] as { hashtag: string; posts: number }[]),
    db.one<{ views: number }>(
      `select coalesce(sum(views), 0)::float8 as views from (select distinct on (p.platform, p.url) p.views from posts p where p.workspace_id = $1 and p.brand_id = $2 and ${win("p", window, 3)} order by p.platform, p.url) x`,
      [workspaceId, brandId, window.from, window.to, tz],
    ),
  ]);

  // coverage per platform with the workspace's capture days per month
  const captureMap = new Map(capture.map((c) => [`${c.platform}|${c.month}`, c]));
  const coverage: Coverage[] = cov.map((c) => ({
    ...c,
    months: months.filter((m) => m.platform === c.platform).map((m) => {
      const cap = captureMap.get(`${c.platform}|${m.month}`);
      return { month: m.month, posts: m.posts, days: cap?.days ?? 0, days_in_month: cap?.days_in_month ?? 30, partial: (cap?.days ?? 0) < PARTIAL_DAYS };
    }),
  }));

  // tiers: one row per band in order, plus unknown followers at the end
  const totalViews = tiers.reduce((a, t) => a + num(t.views), 0);
  const totalCreators = tiers.reduce((a, t) => a + t.creators, 0);
  const tierRows: TierRow[] = [...TIER_BANDS.map((b) => ({ key: b.tier as string, label: b.label })), { key: "unknown", label: "Followers unknown" }].map(({ key, label }) => {
    const t = tiers.find((x) => (x.tier ?? "unknown") === key);
    const creatorsN = t?.creators ?? 0;
    const tooFew = creatorsN < MIN_CREATORS_TO_COMPARE;
    return {
      tier: key, label, creators: creatorsN, posts: t?.posts ?? 0, views: num(t?.views),
      share_creators_pct: pct(creatorsN, totalCreators), share_views_pct: pct(num(t?.views), totalViews),
      median_views: t?.median_views ?? null, er_pct: t && num(t.views) > 0 ? Math.round((num(t.engagements) / num(t.views)) * 10000) / 100 : null,
      cart_pct: t && t.tt_posts > 0 ? Math.round((t.cart_posts / t.tt_posts) * 1000) / 10 : null, too_few: tooFew,
    };
  }).filter((r) => r.tier !== "unknown" || r.creators > 0);

  // posts over time: 13 weeks per platform, owned stacked on earned, gaps where the workspace captured nothing
  const captured = new Set(wsWeeks.map((w) => `${w.platform}|${w.week_start}`));
  const platforms = [...new Set(cov.map((c) => c.platform))];
  const weeks: WeekPoint[] = [];
  for (const platform of platforms) {
    for (const w of weekStarts(ctx.asOf)) {
      const rows = weeksRaw.filter((r) => r.platform === platform && r.week_start === w);
      weeks.push({ week: w, platform, owned: rows.filter((r) => r.source === "owned").reduce((a, r) => a + r.posts, 0), earned: rows.filter((r) => r.source === "earned").reduce((a, r) => a + r.posts, 0), views: rows.reduce((a, r) => a + num(r.views), 0), gap: !captured.has(`${platform}|${w}`) });
    }
  }
  const growth: Growth[] = growthRaw.map((g) => ({ platform: g.platform, posts: g.posts, views: num(g.views), prev_posts: prior ? g.prev_posts : null, prev_views: prior ? num(g.prev_views) : null, comparable: !!prior && g.ws_prev_posts > 0 }));

  // hashtags: the brand's own name tags are flagged so the page can hide them by default
  const brandWords = [b.id, b.name, b.tiktok_handle ?? "", b.instagram_handle ?? ""].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((s) => s.length >= 4);
  const prevMap = new Map(tagsPrev.map((t) => [t.hashtag, t.posts]));
  const hashtags: HashtagRow[] = tagsCur.map((t) => ({
    hashtag: t.hashtag, posts: t.posts, creators: t.creators, views: num(t.views), share_views_pct: pct(num(t.views), num(tagTotal?.views)),
    prev_posts: prior ? prevMap.get(t.hashtag) ?? 0 : null, is_brand: brandWords.some((w) => t.hashtag.includes(w)),
  }));

  return {
    brand: { id: b.id, name: b.name, is_client: b.is_client, tiktok_handle: b.tiktok_handle, instagram_handle: b.instagram_handle, tracked_since: meta?.tracked_since ?? null, last_load: meta?.last_load ?? null },
    client: client ? { id: client.id, name: client.name } : null,
    period, window, prior, coverage, tiers: tierRows, weeks, growth,
    creators: creators.map((c) => ({ ...c, views: num(c.views), worked_for: (c.worked_for as unknown as string[]) ?? [] })),
    hashtags, names,
  };
}

/** Whether the prior period had any capture at all (drives "no comparison" on hashtags). */
export function priorCaptured(d: BrandPageData): boolean {
  return !!d.prior && d.growth.some((g) => g.comparable);
}
