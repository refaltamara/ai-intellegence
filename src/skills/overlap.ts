import { EvidenceList, Where, aggregateEvidence, creatorEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrand, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/** /overlap — which brands hire from the same creator pool. */
export const overlap: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const focus = params.brand ? resolveBrand(params.brand, ctx) : null;
  const limit = limitOf(params);
  const minShared = Number(params.min_shared ?? 2);

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).earned();
  const pMin = wh.next(minShared);
  const pFocus = wh.next(focus);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `with cb as (
       select p.creator_id, p.brand_id, count(*)::int as posts from posts p where ${wh.sql} group by 1, 2
     ), bc as (select brand_id, count(*)::int as creators from cb group by 1),
     pairs as (
       select a.brand_id as brand_a, b.brand_id as brand_b, count(*)::int as shared_creators,
              (array_agg(a.creator_id order by a.posts + b.posts desc))[1:10] as top_creator_ids
       from cb a join cb b on a.creator_id = b.creator_id and a.brand_id < b.brand_id
       group by 1, 2 having count(*) >= ${pMin}
     )
     select pr.brand_a || '|' || pr.brand_b as pair_id, pr.brand_a, pr.brand_b, pr.shared_creators,
            ba.creators as creators_a, bb.creators as creators_b,
            round(pr.shared_creators::numeric / (ba.creators + bb.creators - pr.shared_creators), 4)::float8 as jaccard,
            round(pr.shared_creators::numeric / least(ba.creators, bb.creators) * 100, 1)::float8 as share_of_smaller_pct,
            pr.top_creator_ids, count(*) over() as matched
     from pairs pr join bc ba on ba.brand_id = pr.brand_a join bc bb on bb.brand_id = pr.brand_b
     where ${pFocus}::text is null or pr.brand_a = ${pFocus} or pr.brand_b = ${pFocus}
     order by pr.shared_creators desc, jaccard desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  const ev = new EvidenceList();
  if (rows.length) {
    const ids = [...new Set(rows.flatMap((r) => r.top_creator_ids as string[]))];
    const creators = await db.q<Row>("select id as creator_id, handle as creator_handle, platform, followers_latest, tier_latest from creators where id = any($1::uuid[])", [ids]);
    const byId = new Map(creators.map((c) => [c.creator_id as string, c]));
    const perPair = rows.length <= 20 ? 3 : 1;
    for (const r of rows) {
      const list = (r.top_creator_ids as string[]).map((id) => byId.get(id)).filter(Boolean) as Row[];
      r.shared_list = list.map((c) => c.creator_handle);
      delete r.top_creator_ids;
      const ids: string[] = [];
      const agg = ev.push((eid) => aggregateEvidence(eid, `creators posting for both ${r.brand_a} and ${r.brand_b} in ${w.from}..${w.to}`, `${r.brand_a} × ${r.brand_b} · ${w.label}`, { shared_creators: r.shared_creators as number, creators_a: r.creators_a as number, creators_b: r.creators_b as number, jaccard: r.jaccard as number }));
      if (agg) ids.push(agg);
      for (const c of list.slice(0, perPair)) {
        const id = ev.push((eid) => creatorEvidence(eid, c, { followers: c.followers_latest as number, tier: c.tier_latest as string, shared_between: `${r.brand_a}, ${r.brand_b}` }));
        if (id) ids.push(id);
      }
      r.evidence_ids = ids;
    }
  }
  return {
    params_resolved: { ...params, brand: focus, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", min_shared: minShared, limit },
    summary: { matched, returned: rows.length, window: w.label, focus_brand: focus },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: windowCaveats(w, platforms),
  };
};
