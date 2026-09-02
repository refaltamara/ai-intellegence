import { EvidenceList, NO_SNAPSHOT_CAVEAT, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

function addDays(iso: string, d: number): string {
  const x = new Date(iso + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

/** /waves — an unusual number of creators posting for one brand in a short window. */
export const waves: SkillImpl = async (db, ctx, _def, params) => {
  const lookback = Number(params.lookback_days ?? 7);
  const minCreators = Number(params.min_creators ?? 8);
  const multiple = Number(params.multiple_of_baseline ?? 3);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const end = resolveWindow(params.window, ctx, lookback).to;
  const curFrom = addDays(end, -(lookback - 1));
  const baseFrom = addDays(curFrom, -56);
  const w = { from: baseFrom, to: end, label: `${curFrom} to ${end} vs 8 prior weeks` };

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).earned();
  const pCur = wh.next(curFrom);
  const pTz = wh.next(ctx.tz);
  const pMinC = wh.next(minCreators);
  const pMult = wh.next(multiple);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `with base as (
       select p.brand_id, p.creator_id, p.posted_at,
              (p.posted_at >= (${pCur}::date::timestamp at time zone ${pTz})) as is_current,
              floor(extract(epoch from ((${pCur}::date::timestamp at time zone ${pTz}) - p.posted_at)) / (7 * 86400))::int as wk
       from posts p where ${wh.sql}
     ), cur as (
       select brand_id, count(distinct creator_id)::int as creators_now, count(*)::int as posts_now, min(posted_at) as first_post_at
       from base where is_current group by 1
     ), brand_list as (select distinct brand_id from base),
     wk as (
       select bl.brand_id, g.wk, coalesce(x.creators, 0) as creators
       from brand_list bl cross join generate_series(0, 7) as g(wk)
       left join (select brand_id, wk, count(distinct creator_id) as creators from base where not is_current group by 1, 2) x
         on x.brand_id = bl.brand_id and x.wk = g.wk
     ), baseline as (
       select brand_id, percentile_cont(0.5) within group (order by creators)::float8 as baseline_weekly_median, max(creators)::int as baseline_weekly_max
       from wk group by 1
     )
     select b.brand_id, coalesce(c.creators_now, 0) as creators_now, coalesce(c.posts_now, 0) as posts_now, c.first_post_at,
            b.baseline_weekly_median, b.baseline_weekly_max,
            case when b.baseline_weekly_median > 0 then round((coalesce(c.creators_now, 0) / b.baseline_weekly_median)::numeric, 2)::float8 end as multiple,
            greatest(${pMinC}::float8, ${pMult}::float8 * b.baseline_weekly_median) as threshold,
            (coalesce(c.creators_now, 0) >= greatest(${pMinC}::float8, ${pMult}::float8 * b.baseline_weekly_median)) as in_wave,
            count(*) over() as matched
     from baseline b left join cur c using (brand_id)
     order by in_wave desc, multiple desc nulls last, creators_now desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  const ev = new EvidenceList();
  const flagged = rows.filter((r) => r.in_wave);
  const withPosts = (flagged.length ? flagged : rows.slice(0, 10)).map((r) => r.brand_id as string);
  if (withPosts.length) {
    const pw = new Where().workspace(ctx).window({ from: curFrom, to: end, label: "" }, ctx).platforms(platforms).earned();
    const pB = pw.next(withPosts);
    const per = withPosts.length <= 10 ? 3 : 1;
    const pPer = pw.next(per);
    const posts = await db.q<Row>(
      `select * from (select ${POST_COLS}, row_number() over (partition by p.brand_id order by p.views desc nulls last) as rn
                      from posts p where ${pw.sql} and p.brand_id = any(${pB}::text[])) s where rn <= ${pPer} order by brand_id, rn`,
      pw.params,
    );
    const byBrand = new Map<string, string[]>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post));
      if (id) byBrand.set(post.brand_id as string, [...(byBrand.get(post.brand_id as string) ?? []), id]);
    }
    for (const r of rows) {
      const ids: string[] = [];
      const agg = ev.push((eid) => aggregateEvidence(eid, `creators posting for ${r.brand_id} ${curFrom}..${end} vs weekly median ${baseFrom}..${addDays(curFrom, -1)}`, `${r.brand_id} · ${lookback}-day creator count`, { creators_now: r.creators_now as number, baseline_weekly_median: r.baseline_weekly_median as number, multiple: r.multiple as number, in_wave: r.in_wave ? "yes" : "no" }));
      if (agg) ids.push(agg);
      ids.push(...(byBrand.get(r.brand_id as string) ?? []));
      r.evidence_ids = ids;
      r.top_posts = posts.filter((p) => p.brand_id === r.brand_id).map((p) => p.url);
    }
  }
  return {
    params_resolved: { ...params, window: { from: curFrom, to: end }, platform: params.platform ?? "all", brands: brands ?? "all", lookback_days: lookback, min_creators: minCreators, multiple_of_baseline: multiple, limit },
    summary: { window: w.label, brands_checked: matched, brands_in_wave: flagged.map((r) => r.brand_id), rule: `creators in last ${lookback} days >= max(${minCreators}, ${multiple} × median weekly creators over the prior 8 weeks)` },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: baseFrom, to: end },
    caveats: [...windowCaveats(w, platforms), NO_SNAPSHOT_CAVEAT, "Baseline weeks with no data count as zero creators, which lowers the median early in a platform's history (TikTok before June)."],
  };
};
