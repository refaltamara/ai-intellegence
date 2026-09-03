import { GENERIC_HASHTAGS } from "../config/hashtags";
import { EvidenceList, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { ChartSpec, Row } from "./types";

const RANK: Record<string, string> = { views: "c.views", posts: "c.posts", creators: "c.creators", growth: "change_posts_pct" };

function addDays(iso: string, d: number): string {
  const x = new Date(iso + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000) + 1;
}

export const HASHTAG_DEDUPE_CAVEAT = "Instagram posts tagged to several brands are counted once per hashtag; brand attribution uses every brand the post is tagged to.";

/** /hashtags — hashtag leaderboard and rising hashtags, ranked by views, with the previous window of the same length for change. */
export const hashtags: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 30);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const rankBy = String(params.rank_by ?? "views");
  const order = RANK[rankBy] ?? "c.views";
  const excludeGeneric = params.exclude_generic !== false;
  const minPosts = Number(params.min_posts ?? 3);
  const days = daysBetween(w.from, w.to);
  const prevFrom = addDays(w.from, -days);
  const prevTo = addDays(w.from, -1);
  const full = { from: prevFrom, to: w.to, label: "" };

  const wh = new Where().workspace(ctx).window(full, ctx).platforms(platforms).brands(brands).tiers(params.tiers);
  wh.add("p.hashtags is not null and cardinality(p.hashtags) > 0");
  const pCur = wh.next(w.from);
  const pTz = wh.next(ctx.tz);
  const pGeneric = wh.next(excludeGeneric ? GENERIC_HASHTAGS : []);
  const pMinPosts = wh.next(minPosts);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `with raw as (
       select p.platform, p.url, p.brand_id, p.creator_id, p.views, p.hashtags,
              (p.posted_at >= (${pCur}::date::timestamp at time zone ${pTz})) as is_current
       from posts p where ${wh.sql}
     ), tags as (
       select r.platform, r.url, r.brand_id, r.creator_id, r.views, r.is_current, h as tag
       from raw r, unnest(r.hashtags) h where h <> all(${pGeneric}::text[])
     ), cur as (
       select tag, count(distinct (platform, url))::int as posts, count(distinct creator_id)::int as creators, count(distinct brand_id)::int as brands,
              sum(views) filter (where rn = 1)::float8 as views
       from (select t.*, row_number() over (partition by tag, platform, url order by brand_id) as rn from tags t where is_current) x
       group by tag
     ), prev as (
       select tag, count(distinct (platform, url))::int as posts from tags where not is_current group by tag
     ), brand_top as (
       select distinct on (tag) tag, brand_id, count(distinct (platform, url))::int as posts
       from tags where is_current group by tag, brand_id order by tag, posts desc, brand_id
     ), tot as (select count(distinct (platform, url))::float8 as posts from raw where is_current)
     select c.tag as hashtag, c.posts, c.creators, c.brands, c.views,
            round((c.posts / nullif(tot.posts, 0) * 100)::numeric, 2)::float8 as share_of_posts_pct,
            bt.brand_id as top_brand, bt.posts as top_brand_posts,
            coalesce(pv.posts, 0) as prev_posts,
            case when coalesce(pv.posts, 0) > 0 then round(((c.posts - pv.posts)::numeric / pv.posts * 100), 1)::float8 end as change_posts_pct,
            count(*) over() as matched
     from cur c cross join tot
     left join prev pv using (tag) left join brand_top bt using (tag)
     where c.posts >= ${pMinPosts}
     order by ${order} desc nulls last, c.views desc nulls last
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  const ev = new EvidenceList();
  if (rows.length) {
    const ew = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).tiers(params.tiers);
    const pTags = ew.next(rows.map((r) => r.hashtag));
    const per = rows.length <= 25 ? 2 : 1;
    const pPer = ew.next(per);
    const posts = await db.q<Row>(
      `select * from (
         select ${POST_COLS}, h as tag, row_number() over (partition by h order by p.views desc nulls last) as rn
         from posts p, unnest(p.hashtags) h where ${ew.sql} and h = any(${pTags}::text[])
       ) s where rn <= ${pPer} order by tag, rn`,
      ew.params,
    );
    const byTag = new Map<string, string[]>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post, { hashtag: `#${post.tag}` }));
      if (id) byTag.set(post.tag as string, [...(byTag.get(post.tag as string) ?? []), id]);
    }
    for (const r of rows) {
      const ids: string[] = [];
      const agg = ev.push((eid) => aggregateEvidence(eid, `posts with #${r.hashtag} in ${w.from}..${w.to}`, `#${r.hashtag} · ${w.label}`, { posts: r.posts as number, creators: r.creators as number, views: r.views as number, prev_posts: r.prev_posts as number, change_posts_pct: (r.change_posts_pct as number) ?? null }));
      if (agg) ids.push(agg);
      ids.push(...(byTag.get(r.hashtag as string) ?? []));
      r.evidence_ids = ids;
    }
  }
  const top = rows.slice(0, 12);
  const chart: ChartSpec | undefined = top.length
    ? { type: "bar", title: `Top hashtags by ${rankBy}`, x: top.map((r) => `#${r.hashtag}`), series: [{ name: rankBy === "posts" || rankBy === "creators" ? rankBy : "views", data: top.map((r) => (rankBy === "posts" ? (r.posts as number) : rankBy === "creators" ? (r.creators as number) : (r.views as number))) }], y_label: rankBy === "posts" ? "posts" : rankBy === "creators" ? "creators" : "views" }
    : undefined;

  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, previous_window: { from: prevFrom, to: prevTo }, platform: params.platform ?? "all", brands: brands ?? "all", rank_by: rankBy, exclude_generic: excludeGeneric, min_posts: minPosts, limit },
    summary: { matched, returned: rows.length, window: w.label, previous_window: `${prevFrom} to ${prevTo}`, rank_by: rankBy, top_hashtag: rows[0]?.hashtag ?? null },
    rows,
    chart,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), HASHTAG_DEDUPE_CAVEAT, ...(excludeGeneric ? ["Reach tags (fyp, viral, reels …) and bare category words (makeup, skincare) are excluded; pass exclude_generic=false to include them."] : []), "change_posts_pct compares with the previous window of the same length; null when the hashtag did not appear there."],
  };
};
