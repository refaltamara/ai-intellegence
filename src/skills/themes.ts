import { THEMES, THEME_GROUPS, themeQuery, type Theme } from "../config/themes";
import { EvidenceList, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { limitOf, ParamError, resolveBrands, resolvePlatforms, resolveWindow } from "./params";
import type { SkillImpl } from "./runner";
import type { ChartSpec, Row } from "./types";

/**
 * /themes — share of posts whose caption mentions each theme of a curated
 * lexicon (claims, ingredients, skin concerns, commerce cues), for a brand set
 * against the whole category. Full-text match on posts.caption_tsv; the
 * lexicon lives in src/config/themes.ts.
 */
export const themes: SkillImpl = async (db, ctx, _def, params) => {
  const w = resolveWindow(params.window, ctx, 30);
  const platforms = resolvePlatforms(params.platform);
  const brands = resolveBrands(params.brands, ctx);
  const limit = limitOf(params);
  const group = String(params.group ?? "all");
  if (group !== "all" && !THEME_GROUPS.includes(group as any)) throw new ParamError(`group must be one of ${["all", ...THEME_GROUPS].join("|")}`);
  const selected: Theme[] = THEMES.filter((t) => group === "all" || t.group === group).filter((t) => !(params.themes as string[] | undefined)?.length || (params.themes as string[]).includes(t.key));
  if (!selected.length) throw new ParamError(`No theme matches; known keys: ${THEMES.map((t) => t.key).join(", ")}`);
  const rankBy = String(params.rank_by ?? (brands ? "index" : "share"));

  // one pass over the window; the brand scope is a filter inside the aggregates so category totals come for free
  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).tiers(params.tiers);
  const pKeys = wh.next(selected.map((t) => t.key));
  const pQueries = wh.next(selected.map(themeQuery));
  const pBrands = wh.next(brands);
  const rows = await db.q<Row>(
    `with tq as (select * from unnest(${pKeys}::text[], ${pQueries}::text[]) with ordinality as t(theme, q, ord)),
     tot as (
       select count(distinct (p.platform, p.url))::float8 as posts_all, sum(p.views) filter (where rn = 1)::float8 as views_all,
              count(distinct (p.platform, p.url)) filter (where in_brand)::float8 as posts_brand, sum(p.views) filter (where in_brand and rn = 1)::float8 as views_brand
       from (select p.platform, p.url, p.views, (${pBrands}::text[] is null or p.brand_id = any(${pBrands}::text[])) as in_brand,
                    row_number() over (partition by p.platform, p.url order by p.brand_id) as rn
             from posts p where ${wh.sql}) p
     ), m as (
       select tq.theme, tq.ord, x.platform, x.url, x.brand_id, x.creator_id, x.views,
              (${pBrands}::text[] is null or x.brand_id = any(${pBrands}::text[])) as in_brand,
              row_number() over (partition by tq.theme, x.platform, x.url order by x.brand_id) as rn
       from tq cross join lateral (
         select p.platform, p.url, p.brand_id, p.creator_id, p.views from posts p
         where ${wh.sql} and p.caption_tsv @@ to_tsquery('simple', tq.q)
       ) x
     ), per as (
       select theme, ord,
              count(*) filter (where rn = 1)::int as posts_all, sum(views) filter (where rn = 1)::float8 as views_all,
              count(distinct (platform, url)) filter (where in_brand)::int as posts, count(distinct creator_id) filter (where in_brand)::int as creators,
              sum(views) filter (where in_brand and rn = 1)::float8 as views
       from m group by 1, 2
     ), top_brand as (
       select distinct on (theme) theme, brand_id, count(distinct (platform, url))::int as posts
       from m group by theme, brand_id order by theme, posts desc, brand_id
     )
     select tq.theme, per.posts, per.creators, per.views,
            round((per.posts / nullif(tot.posts_brand, 0) * 100)::numeric, 2)::float8 as share_of_posts_pct,
            round((per.views / nullif(tot.views_brand, 0) * 100)::numeric, 2)::float8 as share_of_views_pct,
            per.posts_all as category_posts,
            round((per.posts_all / nullif(tot.posts_all, 0) * 100)::numeric, 2)::float8 as category_share_pct,
            case when per.posts_all > 0 and tot.posts_brand > 0 then round(((per.posts / tot.posts_brand) / (per.posts_all / tot.posts_all) * 100)::numeric, 0)::float8 end as index_vs_category,
            tb.brand_id as top_brand, tb.posts as top_brand_posts
     from tq left join per using (theme, ord) cross join tot left join top_brand tb using (theme)
     order by tq.ord`,
    wh.params,
  );
  const byKey = new Map(THEMES.map((t) => [t.key, t]));
  const out: Row[] = rows.map((r) => ({ theme: r.theme, group: byKey.get(r.theme as string)?.group, label: byKey.get(r.theme as string)?.label, ...r, posts: r.posts ?? 0, creators: r.creators ?? 0, views: r.views ?? 0 }));
  const sortKey = rankBy === "index" ? "index_vs_category" : rankBy === "views" ? "views" : rankBy === "posts" ? "posts" : "share_of_posts_pct";
  out.sort((a, b) => (Number(b[sortKey] ?? -1) - Number(a[sortKey] ?? -1)) || (Number(b.posts) - Number(a.posts)));
  const kept = out.filter((r) => Number(r.posts) > 0).slice(0, limit);

  const ev = new EvidenceList();
  if (kept.length) {
    const ew = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands(brands).tiers(params.tiers);
    const evThemes = kept.slice(0, 40);
    const pK = ew.next(evThemes.map((r) => r.theme));
    const pQ = ew.next(evThemes.map((r) => themeQuery(byKey.get(r.theme as string)!)));
    const per = evThemes.length <= 12 ? 3 : 1;
    const pPer = ew.next(per);
    const posts = await db.q<Row>(
      `select s.* from unnest(${pK}::text[], ${pQ}::text[]) as t(theme, q)
       cross join lateral (
         select ${POST_COLS}, t.theme as theme from posts p where ${ew.sql} and p.caption_tsv @@ to_tsquery('simple', t.q)
         order by p.views desc nulls last limit ${pPer}
       ) s`,
      ew.params,
    );
    const byTheme = new Map<string, string[]>();
    for (const post of posts) {
      const id = ev.push((eid) => postEvidence(eid, post, { theme: String(post.theme) }));
      if (id) byTheme.set(post.theme as string, [...(byTheme.get(post.theme as string) ?? []), id]);
    }
    for (const r of kept) {
      const ids: string[] = [];
      const agg = ev.push((eid) => aggregateEvidence(eid, `posts whose caption matches theme '${r.theme}' in ${w.from}..${w.to}${brands ? ` for ${brands.join(", ")}` : ""}`, `${r.label} · ${w.label}`, { posts: r.posts as number, share_of_posts_pct: r.share_of_posts_pct as number, category_share_pct: r.category_share_pct as number, index_vs_category: (r.index_vs_category as number) ?? null }));
      if (agg) ids.push(agg);
      ids.push(...(byTheme.get(r.theme as string) ?? []));
      r.evidence_ids = ids;
    }
  }
  const chartRows = kept.slice(0, 15);
  const chart: ChartSpec | undefined = chartRows.length
    ? { type: "bar", title: brands ? "Share of posts mentioning each theme: brand vs category" : "Share of posts mentioning each theme", x: chartRows.map((r) => String(r.label)), y_label: "% of posts", series: brands ? [{ name: brands.join("+"), data: chartRows.map((r) => (r.share_of_posts_pct as number) ?? 0) }, { name: "category", data: chartRows.map((r) => (r.category_share_pct as number) ?? 0) }] : [{ name: "share of posts", data: chartRows.map((r) => (r.category_share_pct as number) ?? 0) }] }
    : undefined;

  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", brands: brands ?? "all", group, themes: selected.map((t) => t.key), rank_by: rankBy, limit },
    summary: { matched: kept.length, returned: kept.length, window: w.label, scope: brands ? brands.join(", ") : "category", lexicon_size: THEMES.length, top_theme: kept[0]?.theme ?? null, strongest_index: brands ? (kept.find((r) => r.index_vs_category != null)?.theme ?? null) : null },
    rows: kept,
    chart,
    evidence: ev.list,
    matched: kept.length,
    data_window: { from: w.from, to: w.to },
    caveats: [
      ...windowCaveats(w, platforms),
      "Themes are whole-word matches on the caption (Indonesian and English variants from the lexicon in src/config/themes.ts); leetspeak and misspellings are missed, and a post can count for several themes.",
      "index_vs_category = brand share ÷ category share × 100 (100 = same as the category; the category includes the brand). Instagram posts tagged to several brands count once in category totals.",
    ],
  };
};
