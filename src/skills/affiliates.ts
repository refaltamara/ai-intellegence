import { AFFILIATE_RULE } from "../config/thresholds";
import { EvidenceList, POST_COLS, Where, aggregateEvidence, creatorEvidence, postEvidence, windowCaveats } from "./common";
import { limitOf, monthWindow, previousWindow, resolveBrands, resolveWindow, type Window } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

type BrandRow = Row & { brand_id: string; posts: number; affiliate_accounts: number; share_of_posts_pct: number | null };

/** /affiliates — TikTok affiliate network per brand (post-level rule from DECISIONS). */
export const affiliates: SkillImpl = async (db, ctx, _def, params) => {
  const platform = String(params.platform ?? "all");
  if (platform !== "all" && platform !== "tiktok") {
    return { status: "unavailable", message: "Affiliate detection uses the TikTok cart flag; Instagram has no equivalent signal.", params_resolved: params, summary: {}, rows: [], evidence: [] };
  }
  const w: Window = params.month ? monthWindow(String(params.month)) : resolveWindow(params.window, ctx, 30);
  const prev = previousWindow(w);
  const brands = resolveBrands(params.brand ? [params.brand] : params.brands, ctx);
  const limit = limitOf(params);
  const rule = (params.rule ?? {}) as { min_cart_posts?: number; strict_min_posts?: number; strict_min_cart_pct?: number };
  const minCart = Number(rule.min_cart_posts ?? AFFILIATE_RULE.min_cart_posts);

  const query = async (win: Window) => {
    const wh = new Where().workspace(ctx).window(win, ctx).platforms(["tiktok"]).brands(brands).earned();
    const pMin = wh.next(minCart);
    const pSp = wh.next(rule.strict_min_posts ?? null);
    const pSc = wh.next(rule.strict_min_cart_pct ?? null);
    return db.q<BrandRow>(
      `with base as (
         select p.brand_id, p.creator_id, p.has_cart, p.views, p.account_type from posts p where ${wh.sql}
       ), pc as (
         select brand_id, creator_id, count(*)::int as posts, count(*) filter (where has_cart)::int as cart_posts,
                sum(views)::float8 as views, bool_or(account_type = 'reseller') as reseller
         from base group by 1, 2
       ), aff as (
         select * from pc where cart_posts >= ${pMin}
           and (${pSp}::int is null or posts >= ${pSp}::int)
           and (${pSc}::float8 is null or cart_posts::float8 / posts * 100 >= ${pSc}::float8)
       ), per_brand as (
         select brand_id, count(distinct creator_id)::int as creators, count(*)::int as posts, sum(views)::float8 as views,
                count(*) filter (where has_cart)::int as affiliate_posts, sum(views) filter (where has_cart)::float8 as affiliate_views,
                count(distinct creator_id) filter (where account_type = 'reseller')::int as reseller_accounts
         from base group by 1
       ), ab as (
         select brand_id, count(*)::int as affiliate_accounts, sum(posts)::int as affiliate_account_posts from aff group by 1
       )
       select pb.brand_id, pb.creators, pb.posts, pb.views, pb.affiliate_posts, coalesce(pb.affiliate_views, 0) as affiliate_views,
              coalesce(ab.affiliate_accounts, 0) as affiliate_accounts, coalesce(ab.affiliate_account_posts, 0) as affiliate_account_posts,
              pb.reseller_accounts,
              case when pb.posts > 0 then round(pb.affiliate_posts::numeric / pb.posts * 100, 2)::float8 end as share_of_posts_pct,
              case when pb.views > 0 then round((pb.affiliate_views / pb.views * 100)::numeric, 2)::float8 end as share_of_views_pct,
              case when pb.creators > 0 then round(coalesce(ab.affiliate_accounts, 0)::numeric / pb.creators * 100, 2)::float8 end as share_of_creators_pct
       from per_brand pb left join ab using (brand_id)
       order by coalesce(ab.affiliate_accounts, 0) desc, pb.affiliate_posts desc`,
      wh.params,
    );
  };

  const [cur, before] = await Promise.all([query(w), query(prev)]);
  const prevMap = new Map(before.map((r) => [r.brand_id, r]));
  const matched = cur.length;
  const rows: Row[] = cur.slice(0, limit).map((r) => {
    const p = prevMap.get(r.brand_id);
    return {
      ...r,
      prev_affiliate_accounts: p?.affiliate_accounts ?? null,
      accounts_change: p ? r.affiliate_accounts - p.affiliate_accounts : null,
      accounts_change_pct: p && p.affiliate_accounts > 0 ? Math.round(((r.affiliate_accounts - p.affiliate_accounts) / p.affiliate_accounts) * 1000) / 10 : null,
      share_of_posts_change_pts: p && p.share_of_posts_pct != null && r.share_of_posts_pct != null ? Math.round((r.share_of_posts_pct - p.share_of_posts_pct) * 100) / 100 : null,
    };
  });

  const ev = new EvidenceList();
  const brandIds = rows.map((r) => r.brand_id as string);
  const perBrand = rows.length <= 10 ? 5 : rows.length <= 30 ? 3 : 1;
  if (brandIds.length) {
    const aw = new Where().workspace(ctx).window(w, ctx).platforms(["tiktok"]).earned();
    const pB = aw.next(brandIds);
    const pMin = aw.next(minCart);
    const pPer = aw.next(perBrand);
    const accounts = await db.q<Row>(
      `select * from (
         select pc.*, c.handle as creator_handle, c.platform, c.followers_latest, c.tier_latest,
                row_number() over (partition by pc.brand_id order by pc.cart_posts desc, pc.views desc) as rn
         from (select p.brand_id, p.creator_id, count(*)::int as posts, count(*) filter (where p.has_cart)::int as cart_posts,
                      sum(p.views)::float8 as views, bool_or(p.account_type = 'reseller') as reseller
               from posts p where ${aw.sql} and p.brand_id = any(${pB}::text[]) group by 1, 2 having count(*) filter (where p.has_cart) >= ${pMin}) pc
         join creators c on c.id = pc.creator_id
       ) s where rn <= ${pPer} order by brand_id, rn`,
      aw.params,
    );
    const byBrand = new Map<string, string[]>();
    for (const r of rows) {
      const id = ev.push((eid) => aggregateEvidence(eid, `posts where platform=tiktok brand_id=${r.brand_id} window ${w.from}..${w.to}`, `${r.brand_id} · affiliate network · ${w.label}`, {
        affiliate_accounts: r.affiliate_accounts as number, affiliate_posts: r.affiliate_posts as number, share_of_posts_pct: r.share_of_posts_pct as number | null, share_of_views_pct: r.share_of_views_pct as number, reseller_accounts: r.reseller_accounts as number,
      }));
      if (id) byBrand.set(r.brand_id as string, [id]);
    }
    for (const a of accounts) {
      const id = ev.push((eid) => creatorEvidence(eid, a, { brand: a.brand_id as string, posts: a.posts as number, cart_posts: a.cart_posts as number, cart_pct: Math.round(((a.cart_posts as number) / (a.posts as number)) * 1000) / 10, views: a.views as number, reseller: a.reseller ? "yes" : "no" }));
      if (id) byBrand.set(a.brand_id as string, [...(byBrand.get(a.brand_id as string) ?? []), id]);
    }
    if (rows.length <= 10 && accounts.length) {
      const sw = new Where().workspace(ctx).window(w, ctx).platforms(["tiktok"]);
      const pIds = sw.next(accounts.map((a) => a.creator_id));
      const pB2 = sw.next(brandIds);
      const samples = await db.q<Row>(
        `select * from (select ${POST_COLS}, row_number() over (partition by p.creator_id, p.brand_id order by p.views desc nulls last) as rn
                        from posts p where ${sw.sql} and p.has_cart and p.creator_id = any(${pIds}::uuid[]) and p.brand_id = any(${pB2}::text[])) s where rn = 1`,
        sw.params,
      );
      for (const s of samples) {
        const id = ev.push((eid) => postEvidence(eid, s));
        if (id) byBrand.set(s.brand_id as string, [...(byBrand.get(s.brand_id as string) ?? []), id]);
      }
    }
    for (const r of rows) r.evidence_ids = byBrand.get(r.brand_id as string) ?? [];
  }

  const totals = cur.reduce((a, r) => ({ affiliate_accounts: a.affiliate_accounts + r.affiliate_accounts, affiliate_posts: a.affiliate_posts + (r.affiliate_posts as number), posts: a.posts + r.posts }), { affiliate_accounts: 0, affiliate_posts: 0, posts: 0 });
  return {
    params_resolved: { ...params, platform: "tiktok", window: { from: w.from, to: w.to }, brands: brands ?? "all", rule: { min_cart_posts: minCart, ...(rule.strict_min_posts ? { strict_min_posts: rule.strict_min_posts } : {}), ...(rule.strict_min_cart_pct ? { strict_min_cart_pct: rule.strict_min_cart_pct } : {}) }, limit },
    summary: { window: w.label, previous_window: prev.label, brands: matched, ...totals, share_of_posts_pct: totals.posts ? Math.round((totals.affiliate_posts / totals.posts) * 10000) / 100 : null, rule: `creator with >= ${minCart} cart post(s) in the window` },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, ["tiktok"]), "Affiliate rule is post-level: any post with a shoppable link counts, so affiliator lists are large (about 46% of TikTok posts carry the flag). Use rule.strict_* for a volume-based definition."],
  };
};
