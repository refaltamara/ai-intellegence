import { EvidenceList, POST_COLS, UNKNOWN_FOLLOWERS_CAVEAT, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { latestMonth, monthWindow, resolveBrand, resolveBrands, resolvePlatforms, resolveWindow, type Window } from "./params";
import type { SkillImpl } from "./runner";
import type { ChartSpec, Row } from "./types";

const STAGE: Record<string, string> = { mega: "awareness", macro: "awareness", mid: "consideration", micro: "conversion", nano: "conversion" };
const TIER_ORDER = ["mega", "macro", "mid", "micro", "nano"];

/** /funnel-mix — a brand's creator mix by funnel stage, compared with other brands. */
export const funnelMix: SkillImpl = async (db, ctx, _def, params) => {
  const brand = resolveBrand(params.brand, ctx);
  const compareTo = params.compare_to === undefined
    ? (ctx.clientBrandId && ctx.clientBrandId !== brand ? [ctx.clientBrandId] : [])
    : (resolveBrands(params.compare_to, ctx) ?? []);
  const brands = [brand, ...compareTo.filter((b) => b !== brand)];
  const platforms = resolvePlatforms(params.platform);
  const w: Window = params.window ? resolveWindow(params.window, ctx) : monthWindow(String(params.month ?? latestMonth(ctx)));

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).earned();
  wh.add("p.tier is not null");
  const cells = await db.q<Row>(
    `select p.brand_id, p.tier, count(*)::int as posts, count(distinct p.creator_id)::int as creators, sum(p.views)::float8 as views,
            count(*) filter (where p.platform = 'tiktok')::int as tiktok_posts, count(*) filter (where p.has_cart)::int as cart_posts
     from posts p where ${wh.sql} group by 1, 2`,
    wh.params,
  );
  const totals = new Map<string, number>();
  for (const c of cells) totals.set(c.brand_id as string, (totals.get(c.brand_id as string) ?? 0) + (c.posts as number));

  const ev = new EvidenceList();
  const rows: Row[] = [];
  const summaryByBrand: Record<string, unknown> = {};
  for (const b of brands) {
    const total = totals.get(b) ?? 0;
    const stages = { awareness: 0, consideration: 0, conversion: 0 };
    for (const t of TIER_ORDER) {
      const c = cells.find((x) => x.brand_id === b && x.tier === t);
      const posts = (c?.posts as number) ?? 0;
      const share = total ? Math.round((posts / total) * 1000) / 10 : 0;
      stages[STAGE[t] as keyof typeof stages] += posts;
      const cartPct = c && (c.tiktok_posts as number) > 0 ? Math.round(((c.cart_posts as number) / (c.tiktok_posts as number)) * 1000) / 10 : null;
      const evId = c ? ev.push((eid) => aggregateEvidence(eid, `posts where brand_id=${b} tier=${t} window ${w.from}..${w.to}`, `${b} · ${t} · ${w.label}`, { posts, creators: c.creators as number, views: c.views as number, cart_pct: cartPct })) : null;
      rows.push({ brand_id: b, tier: t, stage: STAGE[t], posts, creators: (c?.creators as number) ?? 0, views: (c?.views as number) ?? 0, share_of_posts_pct: share, cart_pct: cartPct, evidence_ids: evId ? [evId] : [] });
    }
    const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    const split = { awareness_pct: pct(stages.awareness), consideration_pct: pct(stages.consideration), conversion_pct: pct(stages.conversion) };
    const read = total === 0 ? "no earned posts in the window" : split.awareness_pct >= 40 ? "buying awareness" : split.conversion_pct >= 60 ? "buying conversion" : "balanced mix";
    summaryByBrand[b] = { posts: total, ...split, read };
  }

  // sample top post per brand-tier
  if (cells.length) {
    const sw = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).earned();
    sw.add("p.tier is not null");
    const samples = await db.q<Row>(
      `select * from (select ${POST_COLS}, row_number() over (partition by p.brand_id, p.tier order by p.views desc nulls last) as rn from posts p where ${sw.sql}) s where rn = 1`,
      sw.params,
    );
    for (const s of samples) {
      const row = rows.find((r) => r.brand_id === s.brand_id && r.tier === s.tier);
      const id = ev.push((eid) => postEvidence(eid, s));
      if (row && id) (row.evidence_ids as string[]).push(id);
    }
  }

  const chart: ChartSpec = {
    type: "stacked_bar",
    x: brands,
    y_label: "share of earned posts (%)",
    series: (["awareness", "consideration", "conversion"] as const).map((s) => ({ name: s, stack: "mix", data: brands.map((b) => (summaryByBrand[b] as any)[`${s}_pct`] as number) })),
  };
  return {
    params_resolved: { ...params, brand, compare_to: compareTo, platform: params.platform ?? "all", window: { from: w.from, to: w.to } },
    summary: { window: w.label, stage_mapping: "mega+macro → awareness, mid → consideration, micro+nano → conversion", brands: summaryByBrand },
    rows,
    chart,
    evidence: ev.list,
    matched: rows.length,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), UNKNOWN_FOLLOWERS_CAVEAT, "Cart share is TikTok only; Instagram degrades to tier mix."],
  };
};
