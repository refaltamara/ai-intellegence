import { GENERIC_HASHTAGS } from "../config/hashtags";
import { EvidenceList, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow, type Context } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/**
 * Each brand's own name keys (slug, display name, handles), normalised to
 * [a-z0-9]. A hashtag of 4+ characters contained in one of its own brand's
 * keys (wardah in wardahofficial, hanasui in officialhanasui, kahf in
 * kahfeveryday) is the brand's name tag, not a campaign.
 */
export function brandNameKeys(ctx: Context): { brand_ids: string[]; keys: string[] } {
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const brand_ids: string[] = [];
  const keys: string[] = [];
  for (const b of ctx.brands) {
    const seen = new Set<string>();
    for (const v of [b.id, b.name, b.tiktok_handle, b.instagram_handle]) {
      const n = norm(v);
      if (n && !seen.has(n)) { seen.add(n); brand_ids.push(b.id); keys.push(n); }
    }
  }
  return { brand_ids, keys };
}

/**
 * /campaigns — a campaign is a hashtag concentrated on one brand, used by many
 * distinct creators, within a bounded period. Shows scale, timing and tier mix
 * of competitor campaigns without manual tagging.
 */
export const campaigns: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 90);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const minCreators = Number(params.min_creators ?? 15);
  const minBrandShare = Number(params.min_brand_share_pct ?? 70);
  const includeBrandTags = params.include_brand_tags === true;
  const activeDays = Number(params.active_within_days ?? 14);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).earned();
  wh.add("p.hashtags is not null and cardinality(p.hashtags) > 0");
  const pGeneric = wh.next(GENERIC_HASHTAGS);
  const bk = includeBrandTags ? { brand_ids: [], keys: [] } : brandNameKeys(ctx);
  const pBkIds = wh.next(bk.brand_ids);
  const pBkKeys = wh.next(bk.keys);
  const pBrands = wh.next(brands);
  const pTz = wh.next(ctx.tz);
  const pMinC = wh.next(minCreators);
  const pMinShare = wh.next(minBrandShare);
  const pTo = wh.next(w.to);
  const pActive = wh.next(activeDays);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `with raw as (
       select p.platform, p.url, p.brand_id, p.creator_id, p.views, p.tier, p.hashtags, p.posted_at
       from posts p where ${wh.sql}
     ), bk as (select * from unnest(${pBkIds}::text[], ${pBkKeys}::text[]) as t(brand_id, key)),
     tags as (
       select r.*, h as tag from raw r, unnest(r.hashtags) h
       where h <> all(${pGeneric}::text[])
         and not exists (select 1 from bk where bk.brand_id = r.brand_id and length(h) >= 4 and bk.key like '%' || h || '%')
     ), tag_tot as (select tag, count(distinct (platform, url))::int as posts_all from tags group by tag),
     brand_tot as (select brand_id, count(*)::int as posts, sum(views)::float8 as views from raw group by 1),
     bt as (
       select brand_id, tag, count(*)::int as posts, count(distinct creator_id)::int as creators, sum(views)::float8 as views,
              min(posted_at) as first_seen, max(posted_at) as last_seen,
              count(distinct (posted_at at time zone ${pTz})::date)::int as active_days,
              count(distinct creator_id) filter (where tier = 'nano')::int as nano,
              count(distinct creator_id) filter (where tier = 'micro')::int as micro,
              count(distinct creator_id) filter (where tier = 'mid')::int as mid,
              count(distinct creator_id) filter (where tier = 'macro')::int as macro,
              count(distinct creator_id) filter (where tier = 'mega')::int as mega
       from tags group by 1, 2
     ), peak as (
       select brand_id, tag, wk, posts from (
         select brand_id, tag, date_trunc('week', posted_at at time zone ${pTz})::date as wk, count(*)::int as posts,
                row_number() over (partition by brand_id, tag order by count(*) desc, date_trunc('week', posted_at at time zone ${pTz})::date) as rn
         from tags group by 1, 2, 3
       ) x where rn = 1
     )
     select bt.brand_id || '|' || bt.tag as campaign_id, bt.brand_id, bt.tag as hashtag, bt.posts, bt.creators, bt.views,
            round((bt.posts::numeric / tt.posts_all * 100), 1)::float8 as brand_share_pct,
            round((bt.posts::numeric / b.posts * 100), 1)::float8 as share_of_brand_posts_pct,
            case when b.views > 0 then round((bt.views / b.views * 100)::numeric, 1)::float8 end as share_of_brand_views_pct,
            bt.first_seen, bt.last_seen, bt.active_days, pk.wk as peak_week, pk.posts as peak_week_posts,
            jsonb_build_object('nano', bt.nano, 'micro', bt.micro, 'mid', bt.mid, 'macro', bt.macro, 'mega', bt.mega) as tier_mix,
            (bt.last_seen >= ((${pTo}::date - (${pActive}::int - 1))::timestamp at time zone ${pTz})) as active,
            count(*) over() as matched
     from bt join tag_tot tt using (tag) join brand_tot b using (brand_id) left join peak pk using (brand_id, tag)
     where bt.creators >= ${pMinC} and bt.posts::numeric / tt.posts_all * 100 >= ${pMinShare}
       and (${pBrands}::text[] is null or bt.brand_id = any(${pBrands}::text[]))
     order by bt.creators desc, bt.views desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  const ev = new EvidenceList();
  if (rows.length) {
    const ew = new Where().workspace(ctx).window(w, ctx).platforms(platforms).earned();
    const withPosts = rows.slice(0, 40);
    const pKeys = ew.next(withPosts.map((r) => r.campaign_id));
    const per = withPosts.length <= 15 ? 3 : 1;
    const pPer = ew.next(per);
    const posts = await db.q<Row>(
      `select * from (
         select ${POST_COLS}, p.brand_id || '|' || h as campaign_id, row_number() over (partition by p.brand_id, h order by p.views desc nulls last) as rn
         from posts p, unnest(p.hashtags) h where ${ew.sql} and (p.brand_id || '|' || h) = any(${pKeys}::text[])
       ) s where rn <= ${pPer} order by campaign_id, rn`,
      ew.params,
    );
    const byKey = new Map<string, string[]>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post, { hashtag: `#${String(post.campaign_id).split("|")[1]}` }));
      if (id) byKey.set(post.campaign_id as string, [...(byKey.get(post.campaign_id as string) ?? []), id]);
    }
    for (const r of rows) {
      const ids: string[] = [];
      const agg = ev.push((eid) => aggregateEvidence(eid, `earned posts of ${r.brand_id} with #${r.hashtag} in ${w.from}..${w.to}`, `${r.brand_id} · #${r.hashtag}`, { posts: r.posts as number, creators: r.creators as number, views: r.views as number, brand_share_pct: r.brand_share_pct as number, peak_week: String(r.peak_week ?? ""), peak_week_posts: (r.peak_week_posts as number) ?? null }));
      if (agg) ids.push(agg);
      ids.push(...(byKey.get(r.campaign_id as string) ?? []));
      r.evidence_ids = ids;
    }
  }
  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", min_creators: minCreators, min_brand_share_pct: minBrandShare, include_brand_tags: includeBrandTags, active_within_days: activeDays, limit },
    summary: { matched, returned: rows.length, window: w.label, active_campaigns: rows.filter((r) => r.active).length, brands_with_campaigns: new Set(rows.map((r) => r.brand_id)).size, largest: rows[0] ? { brand_id: rows[0].brand_id, hashtag: rows[0].hashtag, creators: rows[0].creators } : null },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [
      ...windowCaveats(w, platforms),
      `A campaign here is a hashtag with at least ${minCreators} distinct creators on one brand's earned posts, where that brand holds at least ${minBrandShare}% of the hashtag's posts. Tags that are just the brand's own name or handle (or part of it, e.g. hanasui, kahf) are ${includeBrandTags ? "included" : "excluded"}; pass include_brand_tags=true to see brand-name hashtag programmes.`,
      "Earned posts only (creator posts); the brand's own account is not counted. Creators with unknown followers count in creators but not in tier_mix.",
      `active = posted within the last ${activeDays} days of the window.`,
    ],
  };
};
