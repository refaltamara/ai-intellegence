import { EvidenceList, POST_COLS, UNKNOWN_FOLLOWERS_CAVEAT, Where, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/** /breakout — small accounts whose posts travel far beyond their follower base. */
export const breakout: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 30);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const tiers = ((params.tiers as string[] | undefined)?.length ? params.tiers : ["nano"]) as string[];
  const minPer1k = Number(params.min_views_per_1k ?? 5000);
  const minViews = Number(params.min_views ?? 100000);
  const minFollowers = Number(params.min_followers ?? 100);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).earned().tiers(tiers);
  const pMinF = wh.next(minFollowers);
  const pMinV = wh.next(minViews);
  const pMinP = wh.next(minPer1k);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `select ${POST_COLS}, round((p.views::numeric / (p.followers_at_post / 1000.0)), 1)::float8 as views_per_1k,
            count(*) over() as matched
     from posts p
     where ${wh.sql} and p.followers_at_post >= ${pMinF} and p.views >= ${pMinV}
       and p.views::float8 / (p.followers_at_post / 1000.0) >= ${pMinP}
     order by views_per_1k desc, p.views desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  const ev = new EvidenceList(200);
  const out = rows.map((p) => {
    const evidence_id = ev.push((eid) => postEvidence(eid, p, { views_per_1k: p.views_per_1k as number, followers: p.followers_at_post as number }));
    return {
      post_id: p.id, url: p.url, platform: p.platform, creator_id: p.creator_id, creator_handle: p.creator_handle,
      followers: p.followers_at_post, tier: p.tier, brand_id: p.brand_id, posted_at: p.posted_at,
      views: p.views, likes: p.likes, comments: p.comments_count, views_per_1k: p.views_per_1k, has_cart: p.has_cart, evidence_ids: [evidence_id],
    };
  });
  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", tiers, min_views_per_1k: minPer1k, min_views: minViews, min_followers: minFollowers, limit },
    summary: { matched, returned: out.length, window: w.label, rule: `views >= ${minViews} and views per 1k followers >= ${minPer1k} (${minPer1k / 1000} views per follower)` },
    rows: out,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), UNKNOWN_FOLLOWERS_CAVEAT],
  };
};
