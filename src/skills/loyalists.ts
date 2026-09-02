import { EvidenceList, POST_COLS, Where, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrand, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/** /loyalists — creators a brand retained across consecutive months. */
export const loyalists: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 180);
  const platforms = resolvePlatforms(params.platform);
  const brand = resolveBrand(params.brand, ctx);
  const limit = limitOf(params);
  const minMonths = Number(params.min_months ?? 2);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands([brand]).earned();
  const pMin = wh.next(minMonths);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `with cm as (
       select p.creator_id, p.month, count(*)::int as posts, sum(p.views)::float8 as views
       from posts p where ${wh.sql} group by 1, 2
     ), idx as (
       select *, (extract(year from month) * 12 + extract(month from month))::int as mi from cm
     ), isl as (
       select *, mi - row_number() over (partition by creator_id order by mi) as grp from idx
     ), runs as (
       select creator_id, max(cnt)::int as consecutive_months from (select creator_id, grp, count(*) as cnt from isl group by 1, 2) r group by 1
     ), pc as (
       select creator_id, count(*)::int as months_active,
              array_agg(to_char(month, 'YYYY-MM') order by month) as months_active_list,
              sum(posts)::int as posts, sum(views)::float8 as views,
              (array_agg(views order by month))[1] as first_month_views,
              (array_agg(views order by month desc))[1] as last_month_views
       from idx group by 1
     )
     select c.id as creator_id, c.handle as creator_handle, c.platform, c.followers_latest as followers, c.tier_latest as tier,
            pc.months_active, pc.months_active_list, r.consecutive_months, pc.posts, pc.views,
            case when pc.first_month_views > 0 then round(((pc.last_month_views - pc.first_month_views) / pc.first_month_views * 100)::numeric, 1)::float8 end as trend_views_pct,
            count(*) over() as matched
     from pc join runs r using (creator_id) join creators c on c.id = pc.creator_id
     where r.consecutive_months >= ${pMin}
     order by r.consecutive_months desc, pc.months_active desc, pc.posts desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  // Retention for this brand and the category median (brands with >= 20 creators in the window).
  const rw = new Where().workspace(ctx).window(w, ctx).platforms(platforms).earned();
  const pBrand = rw.next(brand);
  const ret = await db.q<{ brand_id: string; creators: number; retained: number; retention_pct: number }>(
    `with cm as (select p.brand_id, p.creator_id, count(distinct p.month)::int as months from posts p where ${rw.sql} group by 1, 2)
     select brand_id, count(*)::int as creators, count(*) filter (where months >= 2)::int as retained,
            round((count(*) filter (where months >= 2))::numeric / count(*) * 100, 1)::float8 as retention_pct
     from cm group by 1 having count(*) >= 20 or brand_id = ${pBrand}`,
    rw.params,
  );
  const mine = ret.find((r) => r.brand_id === brand);
  const others = ret.filter((r) => r.creators >= 20).map((r) => r.retention_pct).sort((a, b) => a - b);
  const median = others.length ? (others.length % 2 ? others[(others.length - 1) / 2] : (others[others.length / 2 - 1] + others[others.length / 2]) / 2) : null;

  const ev = new EvidenceList();
  if (rows.length) {
    const ew = new Where().workspace(ctx).window(w, ctx).brands([brand]).earned();
    const pIds = ew.next(rows.map((r) => r.creator_id));
    const posts = await db.q<Row>(
      `select * from (select ${POST_COLS}, row_number() over (partition by p.creator_id order by p.posted_at desc) as rn
                      from posts p where ${ew.sql} and p.creator_id = any(${pIds}::uuid[])) s where rn <= 2 order by creator_id, rn`,
      ew.params,
    );
    const byCreator = new Map<string, string[]>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post));
      if (id) byCreator.set(post.creator_id as string, [...(byCreator.get(post.creator_id as string) ?? []), id]);
    }
    for (const r of rows) r.evidence_ids = byCreator.get(r.creator_id as string) ?? [];
  }
  const retId = mine ? ev.push((eid) => ({ id: eid, type: "aggregate", ref: `posts where brand_id=${brand} window ${w.from}..${w.to}`, label: `${brand} retention · ${w.label}`, metrics: { creators: mine.creators, retained_2plus_months: mine.retained, retention_pct: mine.retention_pct } })) : null;

  return {
    params_resolved: { ...params, brand, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", min_months: minMonths, limit },
    summary: {
      brand, matched, returned: rows.length, window: w.label,
      retention_pct: mine?.retention_pct ?? null, creators_in_window: mine?.creators ?? 0, retained_creators: mine?.retained ?? 0,
      category_median_retention_pct: median, brands_in_median: others.length, retention_evidence: retId,
    },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [...windowCaveats(w, platforms), "Retention counts a creator as retained when they posted for the brand in at least two distinct months of the window."],
  };
};
