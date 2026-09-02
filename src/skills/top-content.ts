import { EvidenceList, POST_COLS, Where, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

const RANK: Record<string, string> = { views: "p.views", comment_rate: "comment_rate_pct", er_pct: "er_pct", engagements: "p.engagements" };

/** /top-content — best posts by views, comment rate or engagement rate, with content filters. */
export const topContent: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 30);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const rankBy = String(params.rank_by ?? "views");
  const order = RANK[rankBy] ?? "p.views";
  const minViews = Number(params.min_views ?? 1000);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).tiers(params.tiers);
  if (params.has_cart === true) wh.add("p.has_cart");
  if (params.has_cart === false) wh.add("p.has_cart is not true");
  if ((params.content_format as string[] | undefined)?.length) wh.add("p.content_format = any(?::text[])", params.content_format);
  if ((params.product_category as string[] | undefined)?.length) wh.add("p.product_category = any(?::text[])", (params.product_category as string[]).map((s) => s.toLowerCase()));
  if (rankBy !== "views" && rankBy !== "engagements") wh.add("p.views >= ?", minViews);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `select ${POST_COLS}, p.content_type, p.product_name,
            case when p.views > 0 then round(p.comments_count::numeric / p.views * 100, 4)::float8 end as comment_rate_pct,
            case when p.views > 0 then round(p.engagements::numeric / p.views * 100, 4)::float8 end as er_pct,
            count(*) over() as matched
     from posts p where ${wh.sql}
     order by ${order} desc nulls last, p.views desc nulls last
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  const ev = new EvidenceList(200);
  const out = rows.map((p) => {
    const id = ev.push((eid) => postEvidence(eid, p, { er_pct: p.er_pct as number, comment_rate_pct: p.comment_rate_pct as number }));
    return {
      post_id: p.id, url: p.url, platform: p.platform, brand_id: p.brand_id, creator_id: p.creator_id, creator_handle: p.creator_handle, source: p.source,
      tier: p.tier, followers: p.followers_at_post, posted_at: p.posted_at, views: p.views, likes: p.likes, comments: p.comments_count, shares: p.shares, saves: p.saves,
      engagements: p.engagements, er_pct: p.er_pct, comment_rate_pct: p.comment_rate_pct, has_cart: p.has_cart, content_format: p.content_format,
      content_type: p.content_type, product_category: p.product_category, product_name: p.product_name, evidence_ids: [id],
    };
  });
  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", rank_by: rankBy, min_views: minViews, limit },
    summary: { matched, returned: out.length, window: w.label, rank_by: rankBy, filters: { has_cart: params.has_cart ?? null, content_format: params.content_format ?? null, product_category: params.product_category ?? null, tiers: params.tiers ?? null } },
    rows: out,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), ...(params.has_cart != null ? ["The cart (affiliate) flag exists on TikTok only; Instagram posts never match has_cart=true."] : []), "content_format is null for 20 to 30% of Q2 posts; those never match a content_format filter."],
  };
};
