import { GENERIC_HASHTAGS } from "../config/hashtags";
import { EvidenceList, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { limitOf, resolveBrand, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/** /hashtag-overlap — which brands share hashtag space, and what one uses that the other does not. */
export const hashtagOverlap: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 90);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const focus = params.brand ? resolveBrand(params.brand, ctx) : null;
  const limit = limitOf(params);
  const minShared = Number(params.min_shared ?? 3);
  const minTagPosts = Number(params.min_tag_posts ?? 2);
  const excludeGeneric = params.exclude_generic !== false;

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands);
  wh.add("p.hashtags is not null and cardinality(p.hashtags) > 0");
  const pGeneric = wh.next(excludeGeneric ? GENERIC_HASHTAGS : []);
  const pMinTag = wh.next(minTagPosts);
  const pMinShared = wh.next(minShared);
  const pFocus = wh.next(focus);
  const pLimit = wh.next(limit);
  const rows = await db.q<Row>(
    `with bt as (
       select p.brand_id, h as tag, count(*)::int as posts, sum(p.views)::float8 as views
       from posts p, unnest(p.hashtags) h
       where ${wh.sql} and h <> all(${pGeneric}::text[])
       group by 1, 2 having count(*) >= ${pMinTag}
     ), bc as (select brand_id, count(*)::int as tags, sum(posts)::int as tag_posts from bt group by 1),
     pairs as (
       select a.brand_id as brand_a, b.brand_id as brand_b, count(*)::int as shared_tags,
              (array_agg(a.tag order by a.posts + b.posts desc))[1:8] as shared_list,
              sum(a.posts + b.posts)::int as shared_posts
       from bt a join bt b on a.tag = b.tag and a.brand_id < b.brand_id
       group by 1, 2 having count(*) >= ${pMinShared}
     )
     select pr.brand_a || '|' || pr.brand_b as pair_id, pr.brand_a, pr.brand_b, pr.shared_tags, ba.tags as tags_a, bb.tags as tags_b,
            round(pr.shared_tags::numeric / (ba.tags + bb.tags - pr.shared_tags), 4)::float8 as jaccard,
            round(pr.shared_tags::numeric / least(ba.tags, bb.tags) * 100, 1)::float8 as share_of_smaller_pct,
            pr.shared_list, pr.shared_posts,
            count(*) over() as matched
     from pairs pr join bc ba on ba.brand_id = pr.brand_a join bc bb on bb.brand_id = pr.brand_b
     where ${pFocus}::text is null or pr.brand_a = ${pFocus} or pr.brand_b = ${pFocus}
     order by pr.shared_tags desc, jaccard desc
     limit ${pLimit}`,
    wh.params,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  for (const r of rows) delete r.matched;

  // with a focus brand: the busiest tags each side uses that the other never does, for the returned pairs only
  if (focus && rows.length) {
    const others = rows.map((r) => (r.brand_a === focus ? r.brand_b : r.brand_a) as string);
    const dw = new Where().workspace(ctx).window(w, ctx).platforms(platforms);
    dw.add("p.hashtags is not null and cardinality(p.hashtags) > 0");
    const pF = dw.next(focus);
    const pO = dw.next(others);
    const pG = dw.next(excludeGeneric ? GENERIC_HASHTAGS : []);
    const pMin = dw.next(minTagPosts);
    const diff = await db.q<Row>(
      `with bt as (
         select p.brand_id, h as tag, count(*)::int as posts
         from posts p, unnest(p.hashtags) h
         where ${dw.sql} and (p.brand_id = ${pF} or p.brand_id = any(${pO}::text[])) and h <> all(${pG}::text[])
         group by 1, 2 having count(*) >= ${pMin}
       ), f as (select tag, posts from bt where brand_id = ${pF}),
       o as (select brand_id, tag, posts from bt where brand_id <> ${pF})
       select ob.brand_id as other,
              (select array_agg(tag order by posts desc) from (select f.tag, f.posts from f where not exists (select 1 from o where o.brand_id = ob.brand_id and o.tag = f.tag) order by f.posts desc limit 8) z) as only_focus,
              (select array_agg(tag order by posts desc) from (select o.tag, o.posts from o where o.brand_id = ob.brand_id and not exists (select 1 from f where f.tag = o.tag) order by o.posts desc limit 8) z) as only_other
       from (select distinct brand_id from o) ob`,
      dw.params,
    );
    const byOther = new Map(diff.map((d) => [d.other as string, d]));
    for (const r of rows) {
      const other = (r.brand_a === focus ? r.brand_b : r.brand_a) as string;
      r.only_focus = byOther.get(other)?.only_focus ?? [];
      r.only_other = byOther.get(other)?.only_other ?? [];
    }
  }

  const ev = new EvidenceList();
  if (rows.length) {
    // one post per brand for the top shared hashtag of the leading pairs
    const lead = rows.slice(0, 10);
    const ew = new Where().workspace(ctx).window(w, ctx).platforms(platforms);
    const pKeys = ew.next(lead.flatMap((r) => { const tag = (r.shared_list as string[])[0]; return [`${r.brand_a}|${tag}`, `${r.brand_b}|${tag}`]; }));
    const posts = await db.q<Row>(
      `select * from (
         select ${POST_COLS}, h as tag, p.brand_id || '|' || h as key, row_number() over (partition by p.brand_id, h order by p.views desc nulls last) as rn
         from posts p, unnest(p.hashtags) h where ${ew.sql} and (p.brand_id || '|' || h) = any(${pKeys}::text[])
       ) s where rn = 1`,
      ew.params,
    );
    const byKey = new Map<string, string>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post, { hashtag: `#${post.tag}` }));
      if (id) byKey.set(post.key as string, id);
    }
    for (const r of rows) {
      const ids: string[] = [];
      const agg = ev.push((eid) => aggregateEvidence(eid, `hashtags used by both ${r.brand_a} and ${r.brand_b} (>= ${minTagPosts} posts each) in ${w.from}..${w.to}`, `${r.brand_a} × ${r.brand_b} · ${w.label}`, { shared_tags: r.shared_tags as number, tags_a: r.tags_a as number, tags_b: r.tags_b as number, jaccard: r.jaccard as number, top_shared: `#${(r.shared_list as string[])[0]}` }));
      if (agg) ids.push(agg);
      const tag = (r.shared_list as string[])[0];
      for (const k of [`${r.brand_a}|${tag}`, `${r.brand_b}|${tag}`]) { const id = byKey.get(k); if (id) ids.push(id); }
      r.evidence_ids = ids;
    }
  }
  return {
    params_resolved: { ...params, brand: focus, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", min_shared: minShared, min_tag_posts: minTagPosts, exclude_generic: excludeGeneric, limit },
    summary: { matched, returned: rows.length, window: w.label, focus_brand: focus, closest_pair: rows[0] ? { brand_a: rows[0].brand_a, brand_b: rows[0].brand_b, shared_tags: rows[0].shared_tags, jaccard: rows[0].jaccard } : null },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [
      ...windowCaveats(w, platforms),
      `A brand's hashtag set is every tag on at least ${minTagPosts} of its posts (owned and earned) in the window${excludeGeneric ? ", excluding reach tags and bare category words" : ""}. jaccard = shared ÷ union.`,
      ...(focus ? ["only_focus / only_other list the busiest hashtags one brand uses that the other never does."] : []),
    ],
  };
};
