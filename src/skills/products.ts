import { EvidenceList, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

const RANK: Record<string, string> = { views: "views", posts: "posts", creators: "creators", cart_posts: "cart_posts" };

/** "implora-lite-matte-lip-cream-6-pilihan-warna" -> "Implora lite matte lip cream 6 pilihan warna" */
function productLabel(slug: string): string {
  const s = slug.replace(/-+/g, " ").trim();
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 80);
}

/** Free text from the user becomes a safe prefix tsquery: words AND-ed, each as a prefix. */
export function keywordQuery(raw: string): string {
  const words = raw.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((x) => x.length > 1);
  return words.map((x) => `${x}:*`).join(" & ");
}

/**
 * /products — product lines behind the posts. Rows are TikTok Shop products
 * (posts.product_name, present when a product is tagged), with posts, creators,
 * views, cart share and price; an optional keyword narrows to products whose
 * name or caption mentions it, and reports caption mentions across all platforms.
 */
export const products: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 90);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const rankBy = String(params.rank_by ?? "views");
  const order = RANK[rankBy] ?? "views";
  const keyword = typeof params.keyword === "string" && params.keyword.trim() ? params.keyword.trim() : null;
  const tsq = keyword ? keywordQuery(keyword) : null;
  const minPosts = Number(params.min_posts ?? 2);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).tiers(params.tiers);
  wh.add("p.product_name is not null");
  if (tsq) wh.add("(p.caption_tsv @@ to_tsquery('simple', ?) or p.product_name ilike ?)", tsq, `%${keyword!.toLowerCase().replace(/\s+/g, "-")}%`);
  const pMin = wh.next(minPosts);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `select p.brand_id, p.product_name as product_id, count(*)::int as posts, count(distinct p.creator_id)::int as creators,
            sum(p.views)::float8 as views, round(avg(p.views)::numeric, 0)::float8 as avg_views,
            count(*) filter (where p.has_cart)::int as cart_posts,
            round((count(*) filter (where p.has_cart)::numeric / count(*) * 100), 1)::float8 as cart_share_pct,
            count(*) filter (where p.source = 'owned')::int as owned_posts,
            min(p.price)::float8 as price_min, max(p.price)::float8 as price_max, max(p.discount_percent)::float8 as discount_max_pct,
            min(p.posted_at) as first_seen, max(p.posted_at) as last_seen, max(p.product_url) as product_url,
            count(*) over() as matched
     from posts p where ${wh.sql}
     group by p.brand_id, p.product_name
     having count(*) >= ${pMin}
     order by ${order} desc nulls last, posts desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) { delete r.matched; r.product = productLabel(String(r.product_id)); }

  // caption mentions of the keyword across every platform (Instagram has no product tagging)
  let mentions: Row | null = null;
  let mentionBrands: Row[] = [];
  if (tsq) {
    const mw = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).tiers(params.tiers);
    mw.add("p.caption_tsv @@ to_tsquery('simple', ?)", tsq);
    mentions = (await db.one<Row>(`select count(distinct (p.platform, p.url))::int as posts, count(distinct p.creator_id)::int as creators, count(distinct p.brand_id)::int as brands from posts p where ${mw.sql}`, mw.params)) ?? null;
    mentionBrands = await db.q<Row>(`select p.brand_id, count(distinct (p.platform, p.url))::int as posts, sum(p.views)::float8 as views from posts p where ${mw.sql} group by 1 order by 2 desc limit 10`, mw.params);
  }

  const ev = new EvidenceList();
  if (rows.length) {
    const ew = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands);
    const pKeys = ew.next(rows.map((r) => `${r.brand_id}|${r.product_id}`));
    const per = rows.length <= 20 ? 3 : 1;
    const pPer = ew.next(per);
    const posts = await db.q<Row>(
      `select * from (
         select ${POST_COLS}, p.product_name, p.brand_id || '|' || p.product_name as key, row_number() over (partition by p.brand_id, p.product_name order by p.views desc nulls last) as rn
         from posts p where ${ew.sql} and p.product_name is not null and (p.brand_id || '|' || p.product_name) = any(${pKeys}::text[])
       ) s where rn <= ${pPer} order by key, rn`,
      ew.params,
    );
    const byKey = new Map<string, string[]>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post, { product: productLabel(String(post.product_name)).slice(0, 60) }));
      if (id) byKey.set(post.key as string, [...(byKey.get(post.key as string) ?? []), id]);
    }
    for (const r of rows) {
      const ids: string[] = [];
      const agg = ev.push((eid) => aggregateEvidence(eid, `posts of ${r.brand_id} tagged with product '${r.product_id}' in ${w.from}..${w.to}`, `${r.brand_id} · ${String(r.product).slice(0, 50)}`, { posts: r.posts as number, creators: r.creators as number, views: r.views as number, cart_share_pct: r.cart_share_pct as number, price_min: (r.price_min as number) ?? null }));
      if (agg) ids.push(agg);
      ids.push(...(byKey.get(`${r.brand_id}|${r.product_id}`) ?? []));
      r.evidence_ids = ids;
    }
  }
  if (mentionBrands.length) {
    const agg = ev.push((eid) => aggregateEvidence(eid, `posts whose caption mentions '${keyword}' in ${w.from}..${w.to}`, `caption mentions of "${keyword}"`, { posts: (mentions?.posts as number) ?? 0, creators: (mentions?.creators as number) ?? 0, brands: (mentions?.brands as number) ?? 0 }));
    if (agg && rows[0]) (rows[0].evidence_ids as string[]).push(agg);
  }

  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", keyword, rank_by: rankBy, min_posts: minPosts, limit },
    summary: { matched, returned: rows.length, window: w.label, rank_by: rankBy, keyword, ...(mentions ? { caption_mentions: { ...mentions, by_brand: mentionBrands } } : {}), brands_with_products: new Set(rows.map((r) => r.brand_id)).size },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [
      ...windowCaveats(w, platforms),
      "Product rows come from TikTok posts with a tagged shop product (product_name); Instagram posts carry no product tag, so they appear only in caption_mentions when a keyword is given.",
      "Product names are TikTok Shop listing slugs; the same product can appear under several listings.",
    ],
  };
};
