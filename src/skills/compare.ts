import { EvidenceList, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { previousWindow, resolveBrands, resolvePlatforms, resolveWindow, type Window } from "./params";
import type { SkillImpl } from "./runner";
import type { ChartSpec, Row } from "./types";

type Agg = { brand_id: string; source: string; posts: number; creators: number; views: number; engagements: number; comments_count: number; cart_posts: number; tiktok_posts: number };

/** /compare — brands side by side on volume, creators, views, engagements, cart share and share of voice. */
export const compare: SkillImpl = async (db, ctx, _def, params) => {
  const brands = resolveBrands(params.brands, ctx, { required: true })!;
  if (brands.length < 2 || brands.length > 6) throw new Error("compare needs between 2 and 6 brands");
  const w = resolveWindow(params.window, ctx, 30);
  const platforms = resolvePlatforms(params.platform);
  const split = params.split_owned_earned !== false;
  const comparePrev = params.compare_prev !== false;

  const aggregate = async (win: Window) => {
    const wh = new Where().workspace(ctx).window(win, ctx).platforms(platforms).brands(brands);
    const rows = await db.q<Agg>(
      `select p.brand_id, ${split ? "p.source" : "'all'"} as source, count(*)::int as posts, count(distinct p.creator_id)::int as creators,
              sum(p.views)::float8 as views, sum(p.engagements)::float8 as engagements, sum(p.comments_count)::float8 as comments_count,
              count(*) filter (where p.has_cart)::int as cart_posts, count(*) filter (where p.platform = 'tiktok')::int as tiktok_posts
       from posts p where ${wh.sql} group by 1, 2`,
      wh.params,
    );
    const tw = new Where().workspace(ctx).window(win, ctx).platforms(platforms);
    const tot = await db.one<{ posts: number; views: number }>(`select count(*)::int as posts, sum(views)::float8 as views from posts p where ${tw.sql}`, tw.params);
    return { rows, total: tot ?? { posts: 0, views: 0 } };
  };

  const cur = await aggregate(w);
  const prev = comparePrev ? await aggregate(previousWindow(w)) : null;
  const key = (r: Agg) => `${r.brand_id}|${r.source}`;
  const prevMap = new Map(prev?.rows.map((r) => [key(r), r]) ?? []);
  const pct = (a: number, b: number, d = 2) => (b > 0 ? Math.round((a / b) * 100 * 10 ** d) / 10 ** d : null);
  const delta = (a: number | null, b: number | null | undefined) => (a != null && b != null && b !== 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

  const brandPosts = new Map<string, number>();
  for (const r of cur.rows) brandPosts.set(r.brand_id, (brandPosts.get(r.brand_id) ?? 0) + r.posts);
  const prevBrandPosts = new Map<string, number>();
  for (const r of prev?.rows ?? []) prevBrandPosts.set(r.brand_id, (prevBrandPosts.get(r.brand_id) ?? 0) + r.posts);

  const ev = new EvidenceList();
  const rows: Row[] = [];
  for (const b of brands) {
    const sources = split ? ["earned", "owned"] : ["all"];
    for (const s of sources) {
      const r = cur.rows.find((x) => x.brand_id === b && x.source === s);
      if (!r && s === "owned") continue; // Instagram has no owned posts
      const p = prevMap.get(`${b}|${s}`);
      const sov = pct(brandPosts.get(b) ?? 0, cur.total.posts);
      const prevSov = prev ? pct(prevBrandPosts.get(b) ?? 0, prev.total.posts) : null;
      const row: Row = {
        brand_id: b, source: s,
        posts: r?.posts ?? 0, creators: r?.creators ?? 0, views: r?.views ?? 0, engagements: r?.engagements ?? 0, comments_count: r?.comments_count ?? 0,
        er_pct: r ? pct(r.engagements, r.views, 4) : null,
        share_of_voice_pct: sov, cart_share_pct: r && r.tiktok_posts > 0 ? pct(r.cart_posts, r.tiktok_posts) : null,
        positive_pct: null, negative_pct: null, top_topics: null,
      };
      if (prev) {
        row.prev_posts = p?.posts ?? 0;
        row.posts_delta_pct = delta(r?.posts ?? 0, p?.posts ?? 0);
        row.views_delta_pct = delta(r?.views ?? 0, p?.views ?? 0);
        row.creators_delta_pct = delta(r?.creators ?? 0, p?.creators ?? 0);
        row.share_of_voice_delta_pts = sov != null && prevSov != null ? Math.round((sov - prevSov) * 100) / 100 : null;
      }
      const id = ev.push((eid) => aggregateEvidence(eid, `posts where brand_id=${b} source=${s} window ${w.from}..${w.to}`, `${b} · ${s} · ${w.label}`, { posts: row.posts as number, creators: row.creators as number, views: row.views as number, engagements: row.engagements as number, share_of_voice_pct: sov, cart_share_pct: row.cart_share_pct as number | null }));
      row.evidence_ids = id ? [id] : [];
      rows.push(row);
    }
  }

  const pw = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands);
  const top = await db.q<Row>(
    `select * from (select ${POST_COLS}, row_number() over (partition by p.brand_id order by p.views desc nulls last) as rn from posts p where ${pw.sql}) s where rn <= 3 order by brand_id, rn`,
    pw.params,
  );
  for (const t of top) {
    const id = ev.push((eid) => postEvidence(eid, t));
    const row = rows.find((r) => r.brand_id === t.brand_id && (r.source === t.source || r.source === "all"));
    if (row && id) (row.evidence_ids as string[]).push(id);
  }

  const cw = new Where().workspace(ctx).window(w, ctx).platforms(platforms);
  const pB = cw.next(brands);
  const pTz = cw.next(ctx.tz);
  const weekly = await db.q<{ week_start: string; brand_id: string; sov_pct: number }>(
    `with wk as (select (date_trunc('week', p.posted_at at time zone ${pTz}))::date as week_start, p.brand_id, count(*)::int as posts from posts p where ${cw.sql} group by 1, 2),
     tot as (select week_start, sum(posts) as posts from wk group by 1)
     select to_char(wk.week_start, 'YYYY-MM-DD') as week_start, wk.brand_id, round(wk.posts::numeric / tot.posts * 100, 2)::float8 as sov_pct
     from wk join tot using (week_start) where wk.brand_id = any(${pB}::text[]) order by 1, 2`,
    cw.params,
  );
  const weeks = [...new Set(weekly.map((r) => r.week_start))];
  const chart: ChartSpec = {
    type: "line", x: weeks, y_label: "share of voice (% of posts)",
    series: brands.map((b) => ({ name: b, data: weeks.map((wk) => weekly.find((r) => r.brand_id === b && r.week_start === wk)?.sov_pct ?? 0) })),
  };

  return {
    params_resolved: { ...params, brands, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", split_owned_earned: split, compare_prev: comparePrev },
    summary: { window: w.label, previous_window: prev ? previousWindow(w).label : null, workspace_posts_in_window: cur.total.posts, brands: Object.fromEntries(brands.map((b) => [b, { posts: brandPosts.get(b) ?? 0, share_of_voice_pct: pct(brandPosts.get(b) ?? 0, cur.total.posts) }])) },
    rows,
    chart,
    evidence: ev.list,
    matched: rows.length,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), "Share of voice = the brand's share of all tracked posts on the selected platform(s) in the window. Owned vs earned exists on TikTok only. Sentiment and topics arrive in Phase 2."],
  };
};
