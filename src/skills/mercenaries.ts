import { EvidenceList, POST_COLS, Where, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/** /mercenaries — creators who posted for >= N brands inside the window. */
export const mercenaries: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const minBrands = Number(params.min_brands ?? 4);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).earned();
  const pMin = wh.next(minBrands);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `with base as (
       select p.creator_id, p.brand_id, p.platform, p.posted_at, p.views, p.has_cart from posts p where ${wh.sql}
     ), pb as (
       select creator_id, brand_id, count(*)::int as posts, max(posted_at) as last_post from base group by 1, 2
     ), pc as (
       select creator_id, count(*)::int as brand_count, sum(posts)::int as posts, max(last_post) as last_post,
              jsonb_agg(jsonb_build_object('brand', brand_id, 'posts', posts, 'last_post', to_char(last_post at time zone '${ctx.tz}', 'YYYY-MM-DD')) order by last_post desc) as brands
       from pb group by 1 having count(*) >= ${pMin}
     ), pm as (
       select creator_id, sum(views)::float8 as views, count(*) filter (where has_cart)::int as cart_posts,
              bool_or(platform = 'tiktok') as on_tiktok
       from base group by 1
     )
     select c.id as creator_id, c.handle as creator_handle, c.platform, c.followers_latest as followers, c.tier_latest as tier,
            pc.brand_count, pc.posts, pc.brands, pc.last_post, pm.views,
            case when pm.on_tiktok then round((pm.cart_posts::numeric / pc.posts * 100), 2)::float8 end as cart_pct,
            count(*) over() as matched
     from pc join pm using (creator_id) join creators c on c.id = pc.creator_id
     order by pc.brand_count desc, pc.posts desc, pm.views desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  const ev = new EvidenceList();
  if (rows.length) {
    const per = rows.length <= 50 ? 3 : 1;
    const ew = new Where().workspace(ctx).window(w, ctx).earned();
    const pIds = ew.next(rows.map((r) => r.creator_id));
    const pPer = ew.next(per);
    const posts = await db.q<Row>(
      `select * from (
         select ${POST_COLS}, row_number() over (partition by p.creator_id, p.brand_id order by p.posted_at desc) as rb,
                row_number() over (partition by p.creator_id order by p.posted_at desc) as rn
         from posts p where ${ew.sql} and p.creator_id = any(${pIds}::uuid[])
       ) s where rb = 1 and rn <= ${pPer} * 4 order by creator_id, posted_at desc`,
      ew.params,
    );
    const byCreator = new Map<string, string[]>();
    for (const post of posts) {
      const list = byCreator.get(post.creator_id as string) ?? [];
      if (list.length >= per) continue;
      const id = ev.push((eid) => postEvidence(eid, post));
      if (id) byCreator.set(post.creator_id as string, [...list, id]);
    }
    for (const r of rows) r.evidence_ids = byCreator.get(r.creator_id as string) ?? [];
  }

  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", min_brands: minBrands, limit },
    summary: { matched, returned: rows.length, min_brands: minBrands, window: w.label },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: windowCaveats(w, platforms),
  };
};
