import { EvidenceList, POST_COLS, Where, aggregateEvidence, postEvidence, windowCaveats } from "./common";
import { ParamError, resolveBrand, resolvePlatforms } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

function addDays(iso: string, d: number): string {
  const x = new Date(iso + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

/** /launch — week-by-week read of a launch: volume, creators, new vs returning, cart share. */
export const launch: SkillImpl = async (db, ctx, _def, params) => {
  const brand = resolveBrand(params.brand, ctx);
  const start = String(params.start_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new ParamError("start_date must be YYYY-MM-DD");
  const weeks = Math.min(12, Math.max(1, Number(params.weeks ?? 4)));
  const keywords = ((params.keywords as string[] | undefined) ?? []).map((k) => k.trim()).filter(Boolean);
  const platforms = resolvePlatforms(params.platform);
  const end = addDays(start, weeks * 7 - 1);
  const w = { from: start, to: end, label: `${weeks} weeks from ${start}` };

  const wh = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands([brand]).earned();
  if (keywords.length) wh.add("p.caption ilike any(?::text[])", keywords.map((k) => `%${k}%`));
  const pStart = wh.next(start);
  const pTz = wh.next(ctx.tz);
  const rows = await db.q<Row>(
    `with base as (
       select p.*, floor(extract(epoch from (p.posted_at - (${pStart}::date::timestamp at time zone ${pTz}))) / (7 * 86400))::int + 1 as week
       from posts p where ${wh.sql}
     ), first_seen as (
       select creator_id, min(posted_at) as first_post from posts
       where workspace_id = $1 and brand_id = any($6::text[]) and source = 'earned' and creator_id is not null group by 1
     )
     select b.week, count(*)::int as posts, count(distinct b.creator_id)::int as creators,
            sum(b.views)::float8 as views, sum(b.engagements)::float8 as engagements, sum(b.comments_count)::float8 as comments_count,
            count(*) filter (where b.platform = 'tiktok')::int as tiktok_posts, count(*) filter (where b.has_cart)::int as cart_posts,
            count(distinct b.creator_id) filter (where floor(extract(epoch from (f.first_post - (${pStart}::date::timestamp at time zone ${pTz}))) / (7 * 86400))::int + 1 = b.week)::int as new_creators
     from base b left join first_seen f on f.creator_id = b.creator_id
     group by b.week order by b.week`,
    wh.params,
  );
  const byWeek = new Map(rows.map((r) => [Number(r.week), r]));
  const ev = new EvidenceList();
  const out: Row[] = [];
  let prevCreators = 0;
  for (let i = 1; i <= weeks; i++) {
    const r = byWeek.get(i);
    const from = addDays(start, (i - 1) * 7);
    const to = addDays(from, 6);
    const creators = (r?.creators as number) ?? 0;
    const tiktok = (r?.tiktok_posts as number) ?? 0;
    const row: Row = {
      week: i, week_from: from, week_to: to,
      posts: (r?.posts as number) ?? 0, creators, views: (r?.views as number) ?? 0, engagements: (r?.engagements as number) ?? 0, comments_count: (r?.comments_count as number) ?? 0,
      cart_share_pct: tiktok > 0 ? Math.round((((r?.cart_posts as number) ?? 0) / tiktok) * 10000) / 100 : null,
      new_creators: (r?.new_creators as number) ?? 0,
      returning_creators: creators - ((r?.new_creators as number) ?? 0),
      creators_vs_prev_week: i === 1 ? null : creators - prevCreators,
      top_questions: null, topics: null,
    };
    prevCreators = creators;
    const id = ev.push((eid) => aggregateEvidence(eid, `posts where brand_id=${brand} ${from}..${to}${keywords.length ? ` caption~${keywords.join("|")}` : ""}`, `${brand} · week ${i} (${from} to ${to})`, { posts: row.posts as number, creators, new_creators: row.new_creators as number, views: row.views as number, cart_share_pct: row.cart_share_pct as number | null }));
    row.evidence_ids = id ? [id] : [];
    out.push(row);
  }
  const tw = new Where().workspace(ctx).window(w, ctx).platforms(platforms).brands([brand]).earned();
  if (keywords.length) tw.add("p.caption ilike any(?::text[])", keywords.map((k) => `%${k}%`));
  const pS2 = tw.next(start);
  const pTz2 = tw.next(ctx.tz);
  const top = await db.q<Row>(
    `select * from (select ${POST_COLS}, floor(extract(epoch from (p.posted_at - (${pS2}::date::timestamp at time zone ${pTz2}))) / (7 * 86400))::int + 1 as week,
                           row_number() over (partition by floor(extract(epoch from (p.posted_at - (${pS2}::date::timestamp at time zone ${pTz2}))) / (7 * 86400)) order by p.views desc nulls last) as rn
                    from posts p where ${tw.sql}) s where rn <= 3 order by week, rn`,
    tw.params,
  );
  for (const t of top) {
    const id = ev.push((eid) => postEvidence(eid, t));
    const row = out.find((r) => r.week === Number(t.week));
    if (row && id) (row.evidence_ids as string[]).push(id);
  }
  const totals = out.reduce<{ posts: number; creators: number; new_creators: number; views: number }>((a, r) => ({ posts: a.posts + (r.posts as number), creators: a.creators + (r.creators as number), new_creators: a.new_creators + (r.new_creators as number), views: a.views + (r.views as number) }), { posts: 0, creators: 0, new_creators: 0, views: 0 });
  return {
    params_resolved: { ...params, brand, start_date: start, weeks, keywords, platform: params.platform ?? "all", window: { from: start, to: end } },
    summary: { brand, start_date: start, weeks, keywords, ...totals, peak_week: out.reduce((m, r) => ((r.posts as number) > (m.posts as number) ? r : m), out[0]).week },
    rows: out,
    evidence: ev.list,
    matched: out.length,
    data_window: { from: start, to: end },
    caveats: [...windowCaveats(w, platforms), "A creator is 'new' in the week of their first post for the brand anywhere in the loaded data (not only launch-tagged posts). Comment topics and questions arrive in Phase 2.", ...(end > ctx.asOf ? [`The launch window runs past the latest loaded data (${ctx.asOf}); later weeks are empty.`] : [])],
  };
};
