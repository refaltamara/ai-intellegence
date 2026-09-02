import { EvidenceList, POST_COLS, UNKNOWN_FOLLOWERS_CAVEAT, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { isoWeekWindow, latestMonth, monthWindow, resolveBrand, resolvePlatforms, resolveWindow, type Window } from "./params";
import type { SkillImpl } from "./runner";
import type { ChartSpec, Row } from "./types";

/** /brand-strategy — one brand, one month or ISO week: what they did and with whom. */
export const brandStrategy: SkillImpl = async (db, ctx, _def, params) => {
  const brand = resolveBrand(params.brand, ctx);
  const platforms = resolvePlatforms(params.platform);
  const w: Window = params.window ? resolveWindow(params.window, ctx) : params.week ? isoWeekWindow(String(params.week)) : monthWindow(String(params.month ?? latestMonth(ctx)));

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands([brand]);
  const totals = await db.one<Row>(
    `select count(*)::int as posts, count(distinct p.creator_id)::int as creators,
            count(*) filter (where p.source = 'owned')::int as owned_posts, count(*) filter (where p.source = 'earned')::int as earned_posts,
            sum(p.views)::float8 as views, sum(p.views) filter (where p.source = 'owned')::float8 as owned_views, sum(p.views) filter (where p.source = 'earned')::float8 as earned_views,
            sum(p.engagements)::float8 as engagements, sum(p.comments_count)::float8 as comments_count,
            count(*) filter (where p.platform = 'tiktok')::int as tiktok_posts, count(*) filter (where p.has_cart)::int as cart_posts,
            count(*) filter (where p.is_reseller)::int as reseller_posts,
            count(*) filter (where p.platform = 'tiktok')::int as tt, count(*) filter (where p.platform = 'instagram')::int as ig
     from posts p where ${wh.sql}`,
    wh.params,
  );
  const mix = async (col: string, earnedOnly: boolean) => {
    const mw = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands([brand]);
    if (earnedOnly) mw.earned();
    return db.q<{ key: string | null; posts: number; creators: number; views: number; cart_posts: number; tiktok_posts: number }>(
      `select ${col} as key, count(*)::int as posts, count(distinct p.creator_id)::int as creators, sum(p.views)::float8 as views,
              count(*) filter (where p.has_cart)::int as cart_posts, count(*) filter (where p.platform = 'tiktok')::int as tiktok_posts
       from posts p where ${mw.sql} group by 1 order by posts desc`,
      mw.params,
    );
  };
  const [tierMix, formatMix, categoryMix, platformMix] = await Promise.all([mix("p.tier", true), mix("p.content_format", false), mix("p.product_category", false), mix("p.platform", false)]);
  const ww = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands([brand]);
  const pTz = ww.next(ctx.tz);
  const weekly = await db.q<{ week_start: string; posts: number; creators: number; views: number }>(
    `select to_char((date_trunc('week', p.posted_at at time zone ${pTz}))::date, 'YYYY-MM-DD') as week_start, count(*)::int as posts, count(distinct p.creator_id)::int as creators, sum(p.views)::float8 as views
     from posts p where ${ww.sql} group by 1 order by 1`,
    ww.params,
  );
  const tw = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands([brand]);
  const top = await db.q<Row>(`select ${POST_COLS} from posts p where ${tw.sql} order by p.views desc nulls last limit 10`, tw.params);

  const ev = new EvidenceList();
  const posts = (totals?.posts as number) ?? 0;
  const share = (n: number, d = posts) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const mixRows = (list: typeof tierMix, kind: string, denom: number) =>
    list.map((m) => {
      const key = m.key ?? "unknown";
      const id = ev.push((eid) => aggregateEvidence(eid, `posts where brand_id=${brand} ${kind}=${key} window ${w.from}..${w.to}`, `${brand} · ${kind} ${key} · ${w.label}`, { posts: m.posts, creators: m.creators, views: m.views, cart_pct: m.tiktok_posts > 0 ? share(m.cart_posts, m.tiktok_posts) : null }));
      return { [kind]: key, posts: m.posts, creators: m.creators, views: m.views, share_of_posts_pct: share(m.posts, denom), cart_pct: m.tiktok_posts > 0 ? share(m.cart_posts, m.tiktok_posts) : null, evidence_id: id };
    });
  const earnedPosts = (totals?.earned_posts as number) ?? 0;
  const summary = {
    brand, window: w.label, posts, creators: totals?.creators ?? 0, views: totals?.views ?? 0, engagements: totals?.engagements ?? 0, comments_count: totals?.comments_count ?? 0,
    er_pct: (totals?.views as number) > 0 ? Math.round(((totals!.engagements as number) / (totals!.views as number)) * 10000) / 100 : null,
    platforms: Object.fromEntries(platformMix.map((m) => [m.key, m.posts])),
    owned_vs_earned: (totals?.tt as number) > 0 ? { owned_posts: totals?.owned_posts, earned_posts: totals?.earned_posts, owned_share_pct: share(totals?.owned_posts as number), owned_views: totals?.owned_views, earned_views: totals?.earned_views, note: "TikTok only" } : null,
    cart_share_pct: (totals?.tiktok_posts as number) > 0 ? share(totals!.cart_posts as number, totals!.tiktok_posts as number) : null,
    reseller_posts: totals?.reseller_posts ?? 0,
    tier_mix: mixRows(tierMix, "tier", earnedPosts),
    content_format_mix: mixRows(formatMix, "content_format", posts),
    product_category_mix: mixRows(categoryMix, "product_category", posts),
    weekly: weekly,
  };
  const rows = top.map((p, i) => {
    const id = ev.push((eid) => postEvidence(eid, p));
    return { rank: i + 1, post_id: p.id, url: p.url, platform: p.platform, source: p.source, creator_handle: p.creator_handle, tier: p.tier, posted_at: p.posted_at, views: p.views, likes: p.likes, comments: p.comments_count, engagements: p.engagements, has_cart: p.has_cart, content_format: p.content_format, product_category: p.product_category, evidence_ids: id ? [id] : [] };
  });
  const chart: ChartSpec = { type: "line", x: weekly.map((r) => r.week_start), y_label: "posts per week", series: [{ name: "posts", data: weekly.map((r) => r.posts) }, { name: "creators", data: weekly.map((r) => r.creators) }] };
  return {
    params_resolved: { ...params, brand, platform: params.platform ?? "all", window: { from: w.from, to: w.to } },
    summary,
    rows,
    chart,
    evidence: ev.list,
    matched: posts,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), UNKNOWN_FOLLOWERS_CAVEAT, "Tier mix counts earned posts only; content format and product category are null for a large share of posts and appear as 'unknown'."],
  };
};
