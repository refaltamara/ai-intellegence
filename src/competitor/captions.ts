/**
 * What brands are running, from the captions the model read (DECISIONS, 2 Oct
 * 2026; src/captions/): campaigns and launches, the products creators talk
 * about and the angle that drew the most views, and how much of each brand's
 * content carries an offer. The model only named the post's product, event,
 * offer, hook and angle; every number here is a count of distinct posts,
 * creators and views in SQL over those tags, for the period and the one before.
 */
import type { SkillDb } from "../skills/db";
import type { Group, Platform } from "./types";

export type CaptionBrand = { key: string; name: string; client: boolean };

/** How much of the period the tags cover: posts read against posts in the period, by count and by views. */
export type CaptionCoverage = { posts: number; read: number; views: number; read_views: number; read_views_share: number };

export type CaptionEvent = CaptionBrand & {
  event: string;
  event_name: string;
  posts: number;
  creators: number;
  owned_posts: number;
  views: number;
  /** the first post naming it, in the data up to the period's end */
  first_seen: string;
  /** first seen inside the period */
  new: boolean;
  /** posts naming it in the period before */
  posts_prev: number;
  top: { handle: string | null; url: string; views: number } | null;
};

export type CaptionProduct = CaptionBrand & {
  product: string;
  posts: number;
  creators: number;
  views: number;
  posts_prev: number;
  /** the hook that brought the most of its views, and that share */
  hook: string | null;
  hook_views_share: number;
  /** the angle of its most-viewed post */
  angle: string | null;
  offer_share: number;
  top: { handle: string | null; url: string; views: number } | null;
};

export type CaptionOffers = CaptionBrand & { read: number; offer_posts: number; offer_share: number; top_offer: string | null; top_offer_posts: number };

export type CaptionFacts = { coverage: CaptionCoverage; events: CaptionEvent[]; products: CaptionProduct[]; offers: CaptionOffers[] };

const pct0 = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export async function captionFacts(
  db: SkillDb,
  o: { workspaceId: string; tz: string; platforms: Platform[]; groups: Group[]; clientKey: string | null; clientName: string; from: string; to: string; prevFrom: string },
): Promise<CaptionFacts> {
  const pairs = o.groups.flatMap((g) => g.brand_ids.map((b) => [g.key, b] as const));
  const brand = new Map(o.groups.map((g) => [g.key, { key: g.key, name: g.key === o.clientKey ? o.clientName : g.name, client: g.key === o.clientKey }]));
  const empty: CaptionFacts = { coverage: { posts: 0, read: 0, views: 0, read_views: 0, read_views_share: 0 }, events: [], products: [], offers: [] };
  if (!pairs.length) return empty;
  // one CTE for every question: each group's distinct posts in the period ($7..$8) and the one before ($6..$7)
  const base = `with g as (select * from unnest($2::text[], $3::text[]) as t(gkey, brand_id)),
     d as (
       select distinct on (g.gkey, p.platform, p.url) g.gkey, p.platform, p.url, p.creator_handle, p.source, coalesce(p.views, 0)::float8 as views,
              p.posted_at >= ($7::date::timestamp at time zone $4) as cur,
              p.cap_source, p.cap_product, p.cap_event, p.cap_event_name, p.cap_offer, p.cap_hook, p.cap_angle
       from posts p join g on g.brand_id = p.brand_id
       where p.workspace_id = $1 and p.platform = any($5::text[])
         and p.posted_at >= ($6::date::timestamp at time zone $4) and p.posted_at < ($8::date::timestamp at time zone $4)
       order by g.gkey, p.platform, p.url, p.views desc nulls last
     )`;
  const args = [o.workspaceId, pairs.map((p) => p[0]), pairs.map((p) => p[1]), o.tz, o.platforms, o.prevFrom, o.from, o.to];

  const cov = await db.one<{ posts: number; read: number; views: number; read_views: number }>(
    `${base}, u as (select distinct on (platform, url) * from d where cur order by platform, url)
     select count(*)::int as posts, count(*) filter (where cap_source = 'model')::int as read,
            coalesce(sum(views), 0)::float8 as views, coalesce(sum(views) filter (where cap_source = 'model'), 0)::float8 as read_views from u`,
    args,
  );
  const coverage: CaptionCoverage = { posts: cov?.posts ?? 0, read: cov?.read ?? 0, views: cov?.views ?? 0, read_views: cov?.read_views ?? 0, read_views_share: pct0(cov?.read_views ?? 0, cov?.views ?? 0) };
  if (!coverage.read) return { ...empty, coverage };

  const events = await db.q<{ gkey: string; event: string; k: string; event_name: string; posts: number; creators: number; owned_posts: number; views: number; posts_prev: number; top_url: string | null; top_handle: string | null; top_views: number | null; first_seen: string }>(
    `${base},
     e as (
       select gkey, cap_event as event, lower(btrim(cap_event_name)) as k,
              mode() within group (order by cap_event_name) filter (where cur) as event_name,
              count(*) filter (where cur)::int as posts,
              count(distinct creator_handle) filter (where cur and source = 'earned')::int as creators,
              count(*) filter (where cur and source = 'owned')::int as owned_posts,
              coalesce(sum(views) filter (where cur), 0)::float8 as views,
              count(*) filter (where not cur)::int as posts_prev,
              (array_agg(url order by views desc) filter (where cur))[1] as top_url,
              (array_agg(creator_handle order by views desc) filter (where cur))[1] as top_handle,
              (array_agg(views order by views desc) filter (where cur))[1] as top_views
       from d where cap_source = 'model' and cap_event is not null and cap_event <> 'none' and cap_event_name is not null
       group by 1, 2, 3 having count(*) filter (where cur) > 0
       order by 8 desc limit 12
     )
     select e.*, (select to_char(min(p.posted_at at time zone $4), 'YYYY-MM-DD') from posts p join g on g.brand_id = p.brand_id
                  where g.gkey = e.gkey and p.workspace_id = $1 and lower(btrim(p.cap_event_name)) = e.k and p.posted_at < ($8::date::timestamp at time zone $4)) as first_seen
     from e order by e.views desc`,
    args,
  );

  const products = await db.q<{ gkey: string; product: string; posts: number; creators: number; views: number; posts_prev: number; hook: string | null; hook_views: number | null; angle: string | null; offer_posts: number; top_url: string | null; top_handle: string | null; top_views: number | null }>(
    `${base},
     x as (select * from d where cap_source = 'model' and cap_product is not null),
     h as (select gkey, lower(btrim(cap_product)) as k, cap_hook as hook, sum(views) as v, row_number() over (partition by gkey, lower(btrim(cap_product)) order by sum(views) desc, cap_hook) as rn
           from x where cur and cap_hook is not null group by 1, 2, 3)
     select x.gkey, mode() within group (order by x.cap_product) filter (where x.cur) as product,
            count(*) filter (where x.cur)::int as posts,
            count(distinct x.creator_handle) filter (where x.cur and x.source = 'earned')::int as creators,
            coalesce(sum(x.views) filter (where x.cur), 0)::float8 as views,
            count(*) filter (where not x.cur)::int as posts_prev,
            max(h.hook) as hook, max(h.v)::float8 as hook_views,
            (array_agg(x.cap_angle order by x.views desc) filter (where x.cur and x.cap_angle is not null))[1] as angle,
            count(*) filter (where x.cur and x.cap_offer is not null and x.cap_offer <> 'none')::int as offer_posts,
            (array_agg(x.url order by x.views desc) filter (where x.cur))[1] as top_url,
            (array_agg(x.creator_handle order by x.views desc) filter (where x.cur))[1] as top_handle,
            (array_agg(x.views order by x.views desc) filter (where x.cur))[1] as top_views
     from x left join h on h.gkey = x.gkey and h.k = lower(btrim(x.cap_product)) and h.rn = 1
     group by x.gkey, lower(btrim(x.cap_product))
     having count(*) filter (where x.cur) >= 2
     order by 5 desc limit 12`,
    args,
  );

  const offers = await db.q<{ gkey: string; read: number; offer_posts: number; top_offer: string | null; top_offer_posts: number | null }>(
    `${base},
     r as (select * from d where cur and cap_source = 'model'),
     t as (select gkey, cap_offer, count(*) as n, row_number() over (partition by gkey order by count(*) desc, cap_offer) as rn from r where cap_offer is not null and cap_offer <> 'none' group by 1, 2)
     select r.gkey, count(*)::int as read, count(*) filter (where r.cap_offer is not null and r.cap_offer <> 'none')::int as offer_posts,
            max(t.cap_offer) as top_offer, max(t.n)::int as top_offer_posts
     from r left join t on t.gkey = r.gkey and t.rn = 1 group by r.gkey`,
    args,
  );

  const top = (url: string | null, handle: string | null, views: number | null) => (url ? { url, handle, views: views ?? 0 } : null);
  return {
    coverage,
    events: events.map((e) => ({
      ...brand.get(e.gkey)!, event: e.event, event_name: e.event_name, posts: e.posts, creators: e.creators, owned_posts: e.owned_posts, views: e.views,
      first_seen: e.first_seen, new: !!e.first_seen && e.first_seen >= o.from, posts_prev: e.posts_prev, top: top(e.top_url, e.top_handle, e.top_views),
    })),
    products: products.map((p) => ({
      ...brand.get(p.gkey)!, product: p.product, posts: p.posts, creators: p.creators, views: p.views, posts_prev: p.posts_prev,
      hook: p.hook, hook_views_share: pct0(p.hook_views ?? 0, p.views), angle: p.angle, offer_share: pct0(p.offer_posts, p.posts), top: top(p.top_url, p.top_handle, p.top_views),
    })),
    offers: offers
      .filter((x) => x.read > 0)
      .map((x) => ({ ...brand.get(x.gkey)!, read: x.read, offer_posts: x.offer_posts, offer_share: pct0(x.offer_posts, x.read), top_offer: x.top_offer, top_offer_posts: x.top_offer_posts ?? 0 }))
      .sort((a, b) => Number(b.client) - Number(a.client) || b.read - a.read),
  };
}
