import { EvidenceList, POST_COLS, UNKNOWN_FOLLOWERS_CAVEAT, Where, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

const RANK: Record<string, string> = {
  comment_rate: "comment_rate_pct",
  er_pct: "er_pct",
  views_per_1k: "views_per_1k",
  median_views: "median_views",
};

/** /discovery — creators by platform, tier, brand history and exclusion (PRD §4.3). */
export const discovery: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const usedBy = resolveBrands(params.used_by, ctx);
  const exclude = params.exclude_used_by === undefined
    ? (ctx.clientBrandId ? [ctx.clientBrandId] : [])
    : (resolveBrands(params.exclude_used_by, ctx) ?? []);
  const limit = limitOf(params);
  const rankBy = RANK[String(params.rank_by ?? "comment_rate")] ?? "comment_rate_pct";
  const minPosts = Number(params.min_posts_for_brands ?? 1);
  const minViews = Number(params.min_views ?? 1000);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).earned();
  const p = wh.params;
  const pUsed = usedBy ? wh.next(usedBy) : null;
  const pExcl = exclude.length ? wh.next(exclude) : null;
  const pMinPosts = wh.next(minPosts);
  const pMinViews = wh.next(minViews);
  const pTiers = (params.tiers as string[] | undefined)?.length ? wh.next(params.tiers) : null;
  const pMinF = params.min_followers != null ? wh.next(params.min_followers) : null;
  const pMaxF = params.max_followers != null ? wh.next(params.max_followers) : null;
  const pClient = ctx.clientBrandId ? wh.next(ctx.clientBrandId) : null;
  const pLimit = wh.next(limit);

  const rows = await db.q<Row>(
    `with base as (
       select p.creator_id, p.brand_id, p.views, p.comments_count, p.engagements, p.posted_at
       from posts p where ${wh.sql}
     ), per_brand as (
       select creator_id, brand_id, count(*)::int as posts, max(posted_at) as last_post
       from base group by 1, 2
     ), used as (
       select creator_id,
              jsonb_agg(jsonb_build_object('brand', brand_id, 'posts', posts) order by posts desc) as used_by,
              max(posts) as max_posts_one_brand,
              ${pUsed ? `bool_or(brand_id = any(${pUsed}::text[]))` : "true"} as matches_used_by
              ${pClient ? `, coalesce(sum(posts) filter (where brand_id = ${pClient}), 0)::int as client_posts` : ", 0::int as client_posts"}
       from per_brand group by creator_id
     ), per_creator as (
       select creator_id, count(*)::int as posts, count(distinct brand_id)::int as brand_count,
              sum(views)::float8 as views, round(avg(views)::numeric, 1)::float8 as avg_views,
              percentile_cont(0.5) within group (order by views)::float8 as median_views,
              case when sum(views) > 0 then round((sum(comments_count)::numeric / sum(views) * 100), 4)::float8 end as comment_rate_pct,
              case when sum(views) > 0 then round((sum(engagements)::numeric / sum(views) * 100), 4)::float8 end as er_pct,
              max(posted_at) as last_brand_post_at
       from base group by creator_id
     )
     select c.id as creator_id, c.handle as creator_handle, c.platform, c.followers_latest as followers, c.tier_latest as tier,
            pc.posts, pc.brand_count, u.used_by, pc.last_brand_post_at, pc.comment_rate_pct, pc.er_pct, pc.avg_views, pc.median_views,
            case when c.followers_latest > 0 then round((pc.avg_views / (c.followers_latest / 1000.0))::numeric, 2)::float8 end as views_per_1k,
            case when u.client_posts > 0 then 'yes:' || u.client_posts else 'never' end as for_you,
            count(*) over() as matched
     from per_creator pc
     join creators c on c.id = pc.creator_id
     join used u on u.creator_id = pc.creator_id
     where u.matches_used_by and u.max_posts_one_brand >= ${pMinPosts} and coalesce(pc.views, 0) >= ${pMinViews}
       ${pTiers ? `and c.tier_latest = any(${pTiers}::text[])` : ""}
       ${pMinF ? `and c.followers_latest >= ${pMinF}` : ""}
       ${pMaxF ? `and c.followers_latest <= ${pMaxF}` : ""}
       ${pExcl ? `and not exists (select 1 from per_brand x where x.creator_id = c.id and x.brand_id = any(${pExcl}::text[]))` : ""}
     order by ${rankBy} desc nulls last, pc.posts desc
     limit ${pLimit}`,
    p,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  const total = await db.one<{ n: number }>(
    `select count(*)::int as n from creators where workspace_id = $1 ${platforms ? "and platform = any($2::text[])" : ""}`,
    platforms ? [ctx.workspaceId, platforms] : [ctx.workspaceId],
  );

  const ev = new EvidenceList();
  if (rows.length) {
    const perCreator = rows.length <= 50 ? 3 : 1;
    const ew = new Where().workspace(ctx).window(w, ctx).earned();
    const pIds = ew.next(rows.map((r) => r.creator_id));
    const pPer = ew.next(perCreator);
    const posts = await db.q<Row>(
      `select * from (
         select ${POST_COLS}, row_number() over (partition by p.creator_id order by p.posted_at desc) as rn
         from posts p where ${ew.sql} and p.creator_id = any(${pIds}::uuid[])
       ) s where rn <= ${pPer} order by creator_id, rn`,
      ew.params,
    );
    const byCreator = new Map<string, string[]>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post));
      if (id) byCreator.set(post.creator_id as string, [...(byCreator.get(post.creator_id as string) ?? []), id]);
    }
    for (const r of rows) r.evidence_ids = byCreator.get(r.creator_id as string) ?? [];
  }

  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", used_by: usedBy ?? [], exclude_used_by: exclude, rank_by: params.rank_by ?? "comment_rate", min_views: minViews, limit },
    summary: { matched, returned: rows.length, of_total_creators: total?.n ?? 0, window: w.label, rank_by: rankBy, min_views: minViews },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), UNKNOWN_FOLLOWERS_CAVEAT, ...(exclude.length ? [] : ["No client brand is set in this workspace, so nothing is excluded and for_you is always 'never'."])],
  };
};
