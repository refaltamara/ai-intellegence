/**
 * The week's landscape (DECISIONS, 1 Oct 2026): what each watched brand and the
 * client did, beyond the moves the flag rule highlights. Creator tiers, what
 * creators put in front of the camera, when brands post, a close-up per brand,
 * and patterns worth knowing (clippers, one creator carrying a brand, affiliate
 * bursts, templated captions, seeding tags). Every number is computed here in
 * SQL over the panel; the model only phrases them. Distinct posts per brand
 * group; panel-wide figures count a post once across groups.
 */
import { CATEGORIES, CLIPPER_HANDLE_RE, CLIPPER_TAG_RE, DOUBLE_DATE_RE, PAYDAY_RE, categoryQuery } from "../config/categories";
import { GENERIC_HASHTAGS } from "../config/hashtags";
import { THEMES, themeQuery } from "../config/themes";
import type { SkillDb } from "../skills/db";
import { d7Join } from "../definitions/catalog";
import { addDays } from "./weeks";
import type { Group, Platform } from "./types";

export type LandscapeBrand = { key: string; name: string; client: boolean };
export type TierName = "nano" | "micro" | "mid" | "macro" | "mega" | "unknown";
export const TIERS: TierName[] = ["nano", "micro", "mid", "macro", "mega"];

export type TierRow = LandscapeBrand & {
  /** creator posts this week (brand accounts excluded) */
  posts: number;
  views: number;
  tiers: { tier: TierName; posts: number; views: number; content_share: number; views_share: number }[];
  /** the tier that brought the most views */
  top: { tier: TierName; posts: number; views: number; views_share: number } | null;
};

export type ProductRow = LandscapeBrand & {
  posts: number;
  /** % of the brand's posts whose caption names no category */
  unnamed_share: number;
  categories: { key: string; label: string; posts: number; views: number }[];
  /** TikTok Shop products tagged on posts */
  cart: { name: string; posts: number; views: number }[];
};

export type PostingDay = { date: string; posts: number; views: number; promo_posts: number; current: boolean };
export type PostingBrand = LandscapeBrand & {
  posts: number;
  peak_day: string | null;
  peak_posts: number;
  /** % of the brand's posts and views that landed on its peak day */
  peak_posts_share: number;
  peak_views_share: number;
  promo_posts: number;
  promo_share: number;
  double_date_posts: number;
  double_dates: string[];
  payday_posts: number;
};
export type Posting = {
  days: PostingDay[];
  hours: { hour: number; posts: number; median_views: number | null }[];
  /** the shortest run of hours holding at least half of the week's posts */
  window: { from: number; to: number; share: number } | null;
  peak_hour: number | null;
  /** median views per post, lowest and highest across hours with enough posts */
  hour_median_range: { low: number; high: number } | null;
  brands: PostingBrand[];
  /** whole set, this week */
  posts: number;
  promo_posts: number;
};

export type CloseUp = LandscapeBrand & {
  posts: number;
  views: number;
  likes: number;
  comments: number;
  creators: number;
  /** likes + comments over views, % (comparable across platforms) */
  er: number | null;
  tiktok_posts: number;
  instagram_posts: number;
  categories: { label: string; posts: number; views: number }[];
  /** false where the product lexicon does not apply (a non-beauty workspace): no "pushing" line */
  lexicon: boolean;
  cart: { name: string; posts: number; views: number } | null;
  /** brand accounts, TikTok only */
  owned: { posts: number; views: number; views_share: number; median_views: number | null; platforms: Platform[] } | null;
  /** % of creator posts that come from creators posting 3+ times this week */
  repeat_share: number | null;
  top_creator: { handle: string; posts: number; views: number; views_share: number; url: string | null } | null;
  promo_share: number;
  top_post: { handle: string | null; url: string; views: number; platform: Platform } | null;
};

export type PatternKind = "clipper" | "carry" | "affiliate" | "templated" | "seeding";
export type Pattern = LandscapeBrand & {
  kind: PatternKind;
  posts: number;
  accounts: number;
  views: number;
  /** % of the brand's views this week */
  views_share: number;
  /** clippers: median views of a clipper post against the brand's other posts */
  median_views?: number | null;
  median_other?: number | null;
  /** the tag, the caption, or the creator the pattern turns on */
  label?: string;
  examples: { handle: string | null; url: string; views: number }[];
};

export type Landscape = {
  version: 1;
  /** the workspace time zone the days and hours are in */
  tz: string;
  brands: LandscapeBrand[];
  tiers: { rows: TierRow[]; benchmark: { tier: TierName; posts: number; median_views: number | null }[]; overall: { tier: TierName; content_share: number; views_share: number }[] };
  products: ProductRow[];
  posting: Posting;
  closeups: CloseUp[];
  patterns: Pattern[];
};

const pct0 = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const pct1 = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

const PROMO = THEMES.find((t) => t.key === "promo")!;
const ANY_CATEGORY = CATEGORIES.map((c) => `(${categoryQuery(c)})`).join(" | ");

/** Pattern floors: below these a pattern is noise, not news. */
const MIN = { clipper_posts: 3, carry_share: 40, carry_views: 1_000_000, affiliate_posts: 5, templated_creators: 3, seeding_creators: 5, seeding_share: 90, pattern_views: 100_000 };

/** The period a landscape covers: [from, to) against [prevFrom, from), dates in the workspace time zone. A week by default. */
export type LandscapePeriod = { from: string; to: string; prevFrom: string };
export const weekPeriod = (monday: string): LandscapePeriod => ({ from: monday, to: addDays(monday, 7), prevFrom: addDays(monday, -7) });

export async function landscape(
  db: SkillDb,
  o: { workspaceId: string; tz: string; platforms: Platform[]; period: LandscapePeriod; groups: Group[]; clientKey: string | null; clientName: string; brandKeys: string[] },
): Promise<Landscape> {
  const W = o.period.from;
  const P = o.period.prevFrom;
  const toExcl = o.period.to;
  const brands: LandscapeBrand[] = o.groups.map((g) => ({ key: g.key, name: g.key === o.clientKey ? o.clientName : g.name, client: g.key === o.clientKey }));
  const meta = new Map(brands.map((b) => [b.key, b]));
  const pairs = o.groups.flatMap((g) => g.brand_ids.map((b) => [g.key, b] as const));
  const base = `with g as (select * from unnest($2::text[], $3::text[]) as t(gkey, brand_id)),
     d as (
       select distinct on (g.gkey, p.platform, p.url)
              -- views, likes and comments from one reading: day 7, or the latest so far (src/definitions/catalog.ts)
              g.gkey, p.platform, p.url, p.source, p.creator_handle, p.tier, coalesce(d7.views, 0)::float8 as views,
              coalesce(d7.likes, 0)::float8 as likes, coalesce(d7.comments_count, 0)::float8 as comments,
              p.has_cart, p.product_name, p.caption, p.caption_tsv as tsv, p.hashtags,
              (p.posted_at at time zone $4) as local_at,
              (p.posted_at >= ($8::date::timestamp at time zone $4)) as cur
       from posts p join g on g.brand_id = p.brand_id ${d7Join("p", "d7")}
       where p.workspace_id = $1 and p.relevant is not false and p.platform = any($5::text[])
         and p.posted_at >= ($6::date::timestamp at time zone $4) and p.posted_at < ($7::date::timestamp at time zone $4)
       order by g.gkey, p.platform, p.url, d7.views desc nulls last
     ),
     a as (select distinct on (platform, url) * from d order by platform, url, views desc)`;
  const args: unknown[] = [o.workspaceId, pairs.map((p) => p[0]), pairs.map((p) => p[1]), o.tz, o.platforms, P, toExcl, W];

  // ---------------------------------------------------------------- tiers
  const tierRows = await db.q<{ gkey: string; tier: TierName; posts: number; views: number }>(
    `${base}
     select gkey, coalesce(tier, 'unknown') as tier, count(*)::int as posts, sum(views)::float8 as views
     from d where cur and source = 'earned' group by 1, 2`,
    args,
  );
  const bench = await db.q<{ tier: TierName; posts: number; median_views: number | null }>(
    `${base}
     select tier, count(*)::int as posts, percentile_cont(0.5) within group (order by views)::float8 as median_views
     from a where cur and source = 'earned' and tier is not null group by 1`,
    args,
  );
  const tierFor = (key: string): TierRow => {
    const rows = tierRows.filter((r) => r.gkey === key);
    const posts = rows.reduce((s, r) => s + r.posts, 0);
    const views = rows.reduce((s, r) => s + r.views, 0);
    const tiers = TIERS.map((t) => {
      const r = rows.find((x) => x.tier === t);
      return { tier: t, posts: r?.posts ?? 0, views: r?.views ?? 0, content_share: pct0(r?.posts ?? 0, posts), views_share: pct0(r?.views ?? 0, views) };
    });
    const top = [...tiers].sort((a, b) => b.views - a.views)[0];
    return { ...meta.get(key)!, posts, views, tiers, top: top && top.views > 0 ? { tier: top.tier, posts: top.posts, views: top.views, views_share: top.views_share } : null };
  };
  const tiers = brands.map((b) => tierFor(b.key)).filter((t) => t.posts > 0);
  const allPosts = tierRows.filter((r) => r.tier !== "unknown");
  // the set as a whole, each post once per brand group (the rows above): shares of content and of views by tier
  const sumPosts = allPosts.reduce((s, r) => s + r.posts, 0);
  const sumViews = allPosts.reduce((s, r) => s + r.views, 0);
  const overall = TIERS.map((t) => {
    const rs = allPosts.filter((r) => r.tier === t);
    return { tier: t, content_share: pct0(rs.reduce((s, r) => s + r.posts, 0), sumPosts), views_share: pct0(rs.reduce((s, r) => s + r.views, 0), sumViews) };
  });

  // ------------------------------------------------------------- products
  // the product lexicon (src/config/categories.ts) is beauty's: other categories of workspace get no product read
  const wsCategory = (await db.one<{ category: string | null }>("select category from workspaces where id = $1", [o.workspaceId]))?.category ?? null;
  const lexicon = wsCategory == null || wsCategory === "beauty";
  const catArgs = [...args, CATEGORIES.map((c) => c.key), CATEGORIES.map(categoryQuery)];
  const cats = !lexicon ? [] : await db.q<{ gkey: string; key: string; posts: number; views: number }>(
    `${base}
     select d.gkey, c.key, count(*)::int as posts, sum(d.views)::float8 as views
     from d join unnest($9::text[], $10::text[]) as c(key, q) on d.tsv @@ to_tsquery('simple', c.q)
     where d.cur group by 1, 2`,
    catArgs,
  );
  const named = !lexicon ? [] : await db.q<{ gkey: string; posts: number; unnamed: number }>(
    `${base}
     select gkey, count(*)::int as posts, count(*) filter (where not (tsv @@ to_tsquery('simple', $9)))::int as unnamed
     from d where cur group by 1`,
    [...args, ANY_CATEGORY],
  );
  const carts = await db.q<{ gkey: string; name: string; posts: number; views: number }>(
    `${base}
     select gkey, name, posts, views from (
       select gkey, product_name as name, count(*)::int as posts, sum(views)::float8 as views,
              row_number() over (partition by gkey order by sum(views) desc, count(*) desc) as rn
       from d where cur and has_cart and product_name is not null group by 1, 2
     ) x where rn <= 3`,
    args,
  );
  const label = new Map(CATEGORIES.map((c) => [c.key, c.label]));
  const products: ProductRow[] = brands
    .map((b) => {
      const n = named.find((x) => x.gkey === b.key);
      return {
        ...b,
        posts: n?.posts ?? 0,
        unnamed_share: pct0(n?.unnamed ?? 0, n?.posts ?? 0),
        categories: cats.filter((c) => c.gkey === b.key).sort((x, y) => y.posts - x.posts || y.views - x.views).slice(0, 4).map((c) => ({ key: c.key, label: label.get(c.key) ?? c.key, posts: c.posts, views: c.views })),
        cart: carts.filter((c) => c.gkey === b.key).sort((x, y) => y.views - x.views).map(({ gkey: _g, ...c }) => c),
      };
    })
    .filter((p) => p.posts > 0);

  // -------------------------------------------------------------- posting
  const promoQ = themeQuery(PROMO);
  const dayRows = await db.q<{ date: string; posts: number; views: number; promo_posts: number }>(
    `${base}
     select to_char(local_at::date, 'YYYY-MM-DD') as date, count(*)::int as posts, sum(views)::float8 as views,
            count(*) filter (where tsv @@ to_tsquery('simple', $9))::int as promo_posts
     from a group by 1 order by 1`,
    [...args, promoQ],
  );
  const span = Math.round((Date.parse(toExcl) - Date.parse(P)) / 86_400_000);
  const days: PostingDay[] = Array.from({ length: span }, (_, i) => {
    const date = addDays(P, i);
    const r = dayRows.find((x) => x.date === date);
    return { date, posts: r?.posts ?? 0, views: r?.views ?? 0, promo_posts: r?.promo_posts ?? 0, current: date >= W };
  });
  const hourRows = await db.q<{ hour: number; posts: number; median_views: number | null }>(
    `${base}
     select extract(hour from local_at)::int as hour, count(*)::int as posts, percentile_cont(0.5) within group (order by views)::float8 as median_views
     from a where cur group by 1 order by 1`,
    args,
  );
  const hours = Array.from({ length: 24 }, (_, h) => {
    const r = hourRows.find((x) => x.hour === h);
    return { hour: h, posts: r?.posts ?? 0, median_views: r?.median_views ?? null };
  });
  const weekPosts = hours.reduce((s, h) => s + h.posts, 0);
  let window: Posting["window"] = null;
  if (weekPosts > 0) {
    for (let len = 1; len <= 24 && !window; len++) {
      let best = { from: 0, posts: -1 };
      for (let from = 0; from + len <= 24; from++) {
        const n = hours.slice(from, from + len).reduce((s, h) => s + h.posts, 0);
        if (n > best.posts) best = { from, posts: n };
      }
      if (best.posts * 2 >= weekPosts) window = { from: best.from, to: best.from + len, share: pct0(best.posts, weekPosts) };
    }
  }
  const peakHour = weekPosts ? [...hours].sort((a, b) => b.posts - a.posts)[0].hour : null;
  const steady = hours.filter((h) => h.posts >= Math.max(20, weekPosts * 0.02) && h.median_views != null).map((h) => h.median_views!);
  const brandDays = await db.q<{ gkey: string; date: string; posts: number; views: number; promo_posts: number; double_date_posts: number; payday_posts: number; dates: string[] | null }>(
    `${base}
     select gkey, to_char(local_at::date, 'YYYY-MM-DD') as date, count(*)::int as posts, sum(views)::float8 as views,
            count(*) filter (where tsv @@ to_tsquery('simple', $9))::int as promo_posts,
            count(*) filter (where caption ~* $10)::int as double_date_posts,
            count(*) filter (where caption ~* $11)::int as payday_posts,
            array_remove(array_agg(distinct substring(caption from $12)), null) as dates
     from d where cur group by 1, 2`,
    [...args, promoQ, DOUBLE_DATE_RE, PAYDAY_RE, `\\m(([1-9]|1[0-2])\\.\\2)\\M`],
  );
  const postingBrands: PostingBrand[] = brands
    .map((b) => {
      const rs = brandDays.filter((r) => r.gkey === b.key);
      const posts = rs.reduce((s, r) => s + r.posts, 0);
      const views = rs.reduce((s, r) => s + r.views, 0);
      const peak = [...rs].sort((x, y) => y.posts - x.posts || y.views - x.views)[0];
      const promo = rs.reduce((s, r) => s + r.promo_posts, 0);
      return {
        ...b,
        posts,
        peak_day: peak?.date ?? null,
        peak_posts: peak?.posts ?? 0,
        peak_posts_share: pct0(peak?.posts ?? 0, posts),
        peak_views_share: pct0(peak?.views ?? 0, views),
        promo_posts: promo,
        promo_share: pct0(promo, posts),
        double_date_posts: rs.reduce((s, r) => s + r.double_date_posts, 0),
        double_dates: [...new Set(rs.flatMap((r) => r.dates ?? []))].sort(),
        payday_posts: rs.reduce((s, r) => s + r.payday_posts, 0),
      };
    })
    .filter((p) => p.posts > 0);
  const posting: Posting = {
    days,
    hours,
    window,
    peak_hour: peakHour,
    hour_median_range: steady.length ? { low: Math.min(...steady), high: Math.max(...steady) } : null,
    brands: postingBrands,
    posts: weekPosts,
    promo_posts: days.filter((d) => d.current).reduce((s, d) => s + d.promo_posts, 0),
  };

  // ------------------------------------------------------------- close-ups
  // owned accounts are captured on TikTok in the beauty panel and on every platform in listening workspaces:
  // a brand's own share is of the views on the platforms where own accounts are captured at all
  const ownedPlatforms = (await db.q<{ platform: Platform }>("select distinct platform from posts where workspace_id = $1 and source = 'owned'", [o.workspaceId])).map((r) => r.platform);
  const stats = await db.q<{ gkey: string; posts: number; views: number; likes: number; comments: number; creators: number; rated_views: number; rated_eng: number; tiktok_posts: number; instagram_posts: number; owned_posts: number; owned_views: number; owned_median: number | null; owned_base_views: number; owned_base_posts: number; promo_posts: number }>(
    `${base}
     select gkey, count(*)::int as posts, sum(views)::float8 as views, sum(likes)::float8 as likes, sum(comments)::float8 as comments,
            count(distinct creator_handle) filter (where source = 'earned')::int as creators,
            sum(views) filter (where views > 0 and likes + comments <= views)::float8 as rated_views,
            sum(likes + comments) filter (where views > 0 and likes + comments <= views)::float8 as rated_eng,
            count(*) filter (where platform = 'tiktok')::int as tiktok_posts,
            count(*) filter (where platform = 'instagram')::int as instagram_posts,
            count(*) filter (where source = 'owned')::int as owned_posts,
            coalesce(sum(views) filter (where source = 'owned'), 0)::float8 as owned_views,
            (percentile_cont(0.5) within group (order by views) filter (where source = 'owned'))::float8 as owned_median,
            coalesce(sum(views) filter (where platform = any($10::text[])), 0)::float8 as owned_base_views,
            count(*) filter (where platform = any($10::text[]))::int as owned_base_posts,
            count(*) filter (where tsv @@ to_tsquery('simple', $9))::int as promo_posts
     from d where cur group by 1`,
    [...args, promoQ, ownedPlatforms],
  );
  const creatorRows = await db.q<{ gkey: string; handle: string; posts: number; views: number; url: string | null; rn: number }>(
    `${base}
     select gkey, handle, posts, views, url, rn from (
       select gkey, creator_handle as handle, count(*)::int as posts, sum(views)::float8 as views,
              (array_agg(url order by views desc))[1] as url,
              row_number() over (partition by gkey order by sum(views) desc, count(*) desc)::int as rn
       from d where cur and source = 'earned' and creator_handle is not null group by 1, 2
     ) x where rn <= 3 or posts >= 3`,
    args,
  );
  const topPosts = await db.q<{ gkey: string; handle: string | null; url: string; views: number; platform: Platform }>(
    `${base}
     select distinct on (gkey) gkey, creator_handle as handle, url, views, platform from d where cur order by gkey, views desc`,
    args,
  );
  const ownedOn = ownedPlatforms.some((p) => o.platforms.includes(p));
  const closeups: CloseUp[] = brands
    .map((b) => {
      const s = stats.find((x) => x.gkey === b.key);
      if (!s) return null;
      const cr = creatorRows.filter((x) => x.gkey === b.key);
      const earnedPosts = (tierRows.filter((t) => t.gkey === b.key).reduce((a, t) => a + t.posts, 0)) || 0;
      const repeatPosts = cr.filter((x) => x.posts >= 3).reduce((a, x) => a + x.posts, 0);
      const top = cr.find((x) => x.rn === 1);
      const prod = products.find((p) => p.key === b.key);
      const tp = topPosts.find((x) => x.gkey === b.key);
      return {
        ...b,
        posts: s.posts,
        views: s.views,
        likes: s.likes,
        comments: s.comments,
        creators: s.creators,
        er: pct1(s.rated_eng ?? 0, s.rated_views ?? 0),
        tiktok_posts: s.tiktok_posts,
        instagram_posts: s.instagram_posts,
        categories: (prod?.categories ?? []).slice(0, 2).map(({ key: _k, ...c }) => c),
        lexicon,
        cart: prod?.cart[0] ?? null,
        owned: ownedOn && s.owned_base_posts > 0 ? { posts: s.owned_posts, views: s.owned_views, views_share: pct0(s.owned_views, s.owned_base_views), median_views: s.owned_median, platforms: ownedPlatforms.filter((p) => o.platforms.includes(p)) } : null,
        repeat_share: earnedPosts ? pct0(repeatPosts, earnedPosts) : null,
        top_creator: top ? { handle: top.handle, posts: top.posts, views: top.views, views_share: pct0(top.views, s.views), url: top.url } : null,
        promo_share: pct0(s.promo_posts, s.posts),
        top_post: tp ? { handle: tp.handle, url: tp.url, views: tp.views, platform: tp.platform } : null,
      } satisfies CloseUp;
    })
    .filter((c): c is CloseUp => c != null);

  // -------------------------------------------------------------- patterns
  const patterns: Pattern[] = [];
  const viewsOf = new Map(stats.map((s) => [s.gkey, s.views]));
  const clippers = await db.q<{ gkey: string; clip: boolean; posts: number; accounts: number; views: number; median: number | null; examples: { handle: string | null; url: string; views: number }[] | null }>(
    `${base},
     c as (
       select d.*, (coalesce(creator_handle, '') ~* $9 and coalesce(creator_handle, '') !~* 'eclip')
                   or exists (select 1 from unnest(coalesce(hashtags, '{}')) h where h ~* $10) as clip
       from d where cur and source = 'earned'
     )
     select gkey, clip, count(*)::int as posts, count(distinct creator_handle)::int as accounts, sum(views)::float8 as views,
            percentile_cont(0.5) within group (order by views)::float8 as median,
            (array_agg(json_build_object('handle', creator_handle, 'url', url, 'views', views) order by views desc))[1:3] as examples
     from c group by 1, 2`,
    [...args, CLIPPER_HANDLE_RE, CLIPPER_TAG_RE],
  );
  for (const b of brands) {
    const c = clippers.find((x) => x.gkey === b.key && x.clip);
    if (!c || c.posts < MIN.clipper_posts || c.views < MIN.pattern_views) continue;
    const other = clippers.find((x) => x.gkey === b.key && !x.clip);
    patterns.push({ ...b, kind: "clipper", posts: c.posts, accounts: c.accounts, views: c.views, views_share: pct0(c.views, viewsOf.get(b.key) ?? 0), median_views: c.median, median_other: other?.median ?? null, examples: c.examples ?? [] });
  }
  for (const c of closeups) {
    const t = c.top_creator;
    if (t && c.views >= MIN.carry_views && t.views_share >= MIN.carry_share) {
      patterns.push({ key: c.key, name: c.name, client: c.client, kind: "carry", posts: t.posts, accounts: 1, views: t.views, views_share: t.views_share, label: t.handle, examples: t.url ? [{ handle: t.handle, url: t.url, views: t.views }] : [] });
    }
  }
  for (const b of brands) {
    const heavy = creatorRows.filter((x) => x.gkey === b.key && x.posts >= MIN.affiliate_posts).sort((x, y) => y.posts - x.posts);
    if (!heavy.length) continue;
    const views = heavy.reduce((s, x) => s + x.views, 0);
    if (views < MIN.pattern_views) continue;
    const byViews = [...heavy].sort((x, y) => y.views - x.views);
    patterns.push({ ...b, kind: "affiliate", posts: heavy.reduce((s, x) => s + x.posts, 0), accounts: heavy.length, views, views_share: pct0(views, viewsOf.get(b.key) ?? 0), label: byViews[0].handle, examples: byViews.slice(0, 3).map((x) => ({ handle: x.handle, url: x.url ?? "", views: x.views })).filter((x) => x.url) });
  }
  const templated = await db.q<{ gkey: string; caption: string; creators: number; posts: number; views: number; examples: { handle: string | null; url: string; views: number }[] }>(
    `${base},
     n as (select d.*, trim(regexp_replace(regexp_replace(lower(coalesce(caption, '')), '[@#][^[:space:]]+', ' ', 'g'), '\\s+', ' ', 'g')) as norm from d where cur and source = 'earned')
     select gkey, left(min(caption), 140) as caption, count(distinct creator_handle)::int as creators, count(*)::int as posts, sum(views)::float8 as views,
            (array_agg(json_build_object('handle', creator_handle, 'url', url, 'views', views) order by views desc))[1:3] as examples
     from n where length(norm) >= 25 group by gkey, norm having count(distinct creator_handle) >= $9 order by 4 desc`,
    [...args, MIN.templated_creators],
  );
  for (const t of templated) {
    if (t.views < MIN.pattern_views) continue;
    const b = meta.get(t.gkey)!;
    patterns.push({ ...b, kind: "templated", posts: t.posts, accounts: t.creators, views: t.views, views_share: pct0(t.views, viewsOf.get(t.gkey) ?? 0), label: t.caption.replace(/\s+/g, " ").trim(), examples: t.examples });
  }
  const seeding = await db.q<{ gkey: string; tag: string; creators: number; posts: number; views: number; share: number; examples: { handle: string | null; url: string; views: number }[] }>(
    `${base},
     t as (
       select distinct d.gkey, h as tag, d.url, d.creator_handle, d.views from d, unnest(coalesce(d.hashtags, '{}')) h
       where d.cur and d.source = 'earned' and h <> all($9::text[])
         and not exists (select 1 from unnest($10::text[]) k where length(h) >= 4 and k like '%' || h || '%')
     ),
     agg as (
       select gkey, tag, count(distinct creator_handle)::int as creators, count(distinct url)::int as posts, sum(views)::float8 as views,
              (array_agg(json_build_object('handle', creator_handle, 'url', url, 'views', views) order by views desc))[1:3] as examples
       from t group by 1, 2 having count(distinct creator_handle) >= $11
     ),
     tot as (
       select h as tag, count(distinct p.url)::int as posts_all from posts p, unnest(p.hashtags) h
       where p.workspace_id = $1 and p.relevant is not false and p.platform = any($5::text[])
         and p.posted_at >= ($8::date::timestamp at time zone $4) and p.posted_at < ($7::date::timestamp at time zone $4)
         and h in (select tag from agg) group by 1
     )
     select agg.gkey, agg.tag, agg.creators, agg.posts, agg.views, round(agg.posts::numeric / nullif(tot.posts_all, 0) * 100)::int as share, agg.examples
     from agg join tot using (tag) where agg.posts::numeric / nullif(tot.posts_all, 0) * 100 >= $12 order by agg.creators desc`,
    [...args, GENERIC_HASHTAGS, o.brandKeys, MIN.seeding_creators, MIN.seeding_share],
  );
  for (const s of seeding) {
    // one tag per brand: the widest
    if (patterns.some((p) => p.kind === "seeding" && p.key === s.gkey)) continue;
    const b = meta.get(s.gkey)!;
    patterns.push({ ...b, kind: "seeding", posts: s.posts, accounts: s.creators, views: s.views, views_share: pct0(s.views, viewsOf.get(s.gkey) ?? 0), label: s.tag, examples: s.examples });
  }
  // a pattern that moves under 1% of a brand's views is a footnote, not news
  const kept = patterns.filter((p) => p.views_share >= 1 || p.views >= MIN.carry_views).sort((a, b) => b.views - a.views);
  patterns.length = 0;
  patterns.push(...kept);

  return { version: 1, tz: o.tz, brands, tiers: { rows: tiers, benchmark: TIERS.map((t) => ({ tier: t, posts: bench.find((x) => x.tier === t)?.posts ?? 0, median_views: bench.find((x) => x.tier === t)?.median_views ?? null })), overall }, products, posting, closeups, patterns };
}
