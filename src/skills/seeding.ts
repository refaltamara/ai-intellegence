import { EvidenceList, PLATFORM_LABEL, aggregateEvidence, commentEvidence, profileUrl } from "./common";
import { SUBJECT_REPLIES_CAVEAT, commentWhere, commentWindow } from "./comments-common";
import { limitOf, resolvePlatforms } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/** /seeding — coordinated comment patterns: identical wording across accounts, one account repeating across posts, bursts of first-time commenters. */
export const seeding: SkillImpl = async (db, ctx, _def, params) => {
  const platforms = resolvePlatforms(params.platform);
  const w = await commentWindow(db, ctx, params.window, 30, platforms);
  const minAuthors = Math.max(2, Number(params.min_authors ?? 3));
  const minRepeats = Math.max(2, Number(params.min_repeats ?? 5));
  const burstMinutes = Math.max(1, Number(params.burst_minutes ?? 10));
  const burstMinAuthors = Math.max(3, Number(params.burst_min_authors ?? 15));
  const limit = limitOf(params, 50);

  const p: unknown[] = [];
  const where = commentWhere(ctx, w, platforms, p);
  const pMinA = `$${p.push(minAuthors)}`;
  const pMinR = `$${p.push(minRepeats)}`;
  const pBurstMin = `$${p.push(burstMinutes)}`;
  const pBurstA = `$${p.push(burstMinAuthors)}`;
  const pTz = `$${p.push(ctx.tz)}`;
  const pLimit = `$${p.push(limit)}`;
  const rows = await db.q<Row>(
    `with c as (
       select c.id, c.post_id, c.platform, c.author_handle, c.posted_at, coalesce(c.likes, 0) as likes, c.text, c.sentiment,
              regexp_replace(lower(c.text), '[^[:alnum:]]+', ' ', 'g') as norm
       from comments c where ${where} and c.text is not null and c.author_handle is not null
     ),
     phrasing as (
       select 'same_wording' as kind, norm as key, count(*)::int as comments, count(distinct author_handle)::int as authors,
              count(distinct post_id)::int as posts, min(posted_at) as first_at, max(posted_at) as last_at,
              (array_agg(id order by likes desc, posted_at))[1:3] as sample_ids, count(*) filter (where sentiment = 'negative')::int as negative,
              (array_agg(distinct platform))[1] as platform
       from c where length(norm) >= 15
       group by norm having count(distinct author_handle) >= ${pMinA}
     ),
     repeaters as (
       select 'repeat_account' as kind, author_handle as key, count(*)::int as comments, 1 as authors,
              count(distinct post_id)::int as posts, min(posted_at) as first_at, max(posted_at) as last_at,
              (array_agg(id order by likes desc, posted_at))[1:3] as sample_ids, count(*) filter (where sentiment = 'negative')::int as negative,
              (array_agg(distinct platform))[1] as platform
       from c group by author_handle having count(*) >= ${pMinR} and count(distinct post_id) >= 2
     ),
     firsts as (
       select post_id, author_handle, min(posted_at) as first_here, count(*) over (partition by author_handle) as author_total
       from c group by post_id, author_handle
     ),
     only_once as (
       select post_id, author_handle, first_here from firsts f
       where author_total = 1 and (select x.platform from c x where x.post_id = f.post_id limit 1) <> 'youtube'
     ),
     burst as (
       -- how many first-time commenters land on this post within the window, counted with a
       -- range frame instead of a correlated subquery: one pass per post, not one per row
       select post_id, first_here,
              count(*) over (partition by post_id order by first_here
                             range between current row and (${pBurstMin} || ' minutes')::interval following)::int as authors
       from only_once
     ),
     burst_best as (
       select 'burst' as kind, b.post_id::text as key, b.authors as comments, b.authors, 1 as posts, b.first_at as first_at,
              b.first_at + (${pBurstMin} || ' minutes')::interval as last_at, b.sample_ids, b.negative, b.platform,
              row_number() over (partition by b.post_id order by b.authors desc, b.first_at) as rn
       from (
         select bb.post_id, bb.first_here as first_at, bb.authors,
                (select (array_agg(x.id order by x.likes desc))[1:3] from c x
                  where x.post_id = bb.post_id and x.posted_at >= bb.first_here and x.posted_at < bb.first_here + (${pBurstMin} || ' minutes')::interval) as sample_ids,
                (select count(*) from c x
                  where x.post_id = bb.post_id and x.posted_at >= bb.first_here and x.posted_at < bb.first_here + (${pBurstMin} || ' minutes')::interval and x.sentiment = 'negative')::int as negative,
                (select x.platform from c x where x.post_id = bb.post_id limit 1) as platform
         from (select distinct on (post_id) post_id, first_here, authors from burst where authors >= ${pBurstA} order by post_id, authors desc, first_here) bb
       ) b
     )
     select kind, key, comments, authors, posts, to_char(first_at at time zone ${pTz}, 'YYYY-MM-DD HH24:MI') as first_at,
            to_char(last_at at time zone ${pTz}, 'YYYY-MM-DD HH24:MI') as last_at, sample_ids, negative, platform, count(*) over() as matched
     from (select * from phrasing union all select * from repeaters union all select kind, key, comments, authors, posts, first_at, last_at, sample_ids, negative, platform from burst_best where rn = 1) u
     order by case kind when 'burst' then 0 when 'same_wording' then 1 else 2 end, authors desc, comments desc
     limit ${pLimit}`,
    p,
  );
  const matched = rows.length ? Number(rows[0].matched) : 0;
  const totals = await db.one<{ comments: number; authors: number; posts: number }>(
    `select count(*)::int as comments, count(distinct c.author_handle)::int as authors, count(distinct c.post_id)::int as posts from comments c where ${where}`,
    p.slice(0, 0 + p.length - 6),
  );

  const ev = new EvidenceList(160);
  const sampleIds = [...new Set(rows.flatMap((r) => (r.sample_ids as string[] | null) ?? []))];
  const samples = sampleIds.length
    ? await db.q<Row>(`select c.id, c.author_handle, c.platform, c.posted_at, c.likes, c.text, c.sentiment, p.url as post_url from comments c join posts p on p.id = c.post_id where c.id = any($1::uuid[])`, [sampleIds])
    : [];
  const postUrl = new Map(samples.map((s) => [s.id as string, s.post_url as string]));
  const sampleEv = new Map<string, string>();
  const out = rows.map((r, i) => {
    const ids: string[] = [];
    const kind = r.kind as string;
    const label = kind === "same_wording" ? `same wording from ${r.authors} accounts` : kind === "repeat_account" ? `@${r.key} · ${r.comments} comments on ${r.posts} posts` : `${r.authors} first-time commenters in ${burstMinutes} min`;
    const agg = ev.push((eid) => ({
      ...aggregateEvidence(eid, `${kind} pattern in comments ${w.from}..${w.to}`, `${label} · ${PLATFORM_LABEL[r.platform as string] ?? r.platform}`, { comments: r.comments as number, authors: r.authors as number, posts: r.posts as number, negative: r.negative as number }),
      url: kind === "repeat_account" ? profileUrl(r.platform as string, r.key as string) : kind === "burst" ? postUrl.get(((r.sample_ids as string[]) ?? [])[0]) : undefined,
    }));
    if (agg) ids.push(agg);
    for (const sid of (r.sample_ids as string[] | null) ?? []) {
      const s = samples.find((x) => x.id === sid);
      if (!s) continue;
      let id = sampleEv.get(sid);
      if (!id) {
        id = ev.push((eid) => commentEvidence(eid, s)) ?? undefined;
        if (id) sampleEv.set(sid, id);
      }
      if (id) ids.push(id);
    }
    const first = samples.find((x) => x.id === ((r.sample_ids as string[]) ?? [])[0]);
    return {
      incident_id: `${kind}:${i}:${String(r.key).slice(0, 40)}`, kind, platform: r.platform,
      what: kind === "same_wording" ? String(first?.text ?? r.key).replace(/\s+/g, " ").slice(0, 160) : kind === "repeat_account" ? `@${r.key}` : `${r.authors} first-time commenters on one post within ${burstMinutes} minutes`,
      comments: r.comments, accounts: r.authors, posts: r.posts, negative: r.negative, first_at: r.first_at, last_at: r.last_at,
      post_url: kind !== "repeat_account" ? postUrl.get(((r.sample_ids as string[]) ?? [])[0]) ?? null : null, incident: true, evidence_ids: ids,
    };
  });
  const byKind = { same_wording: out.filter((r) => r.kind === "same_wording").length, repeat_account: out.filter((r) => r.kind === "repeat_account").length, burst: out.filter((r) => r.kind === "burst").length };
  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", min_authors: minAuthors, min_repeats: minRepeats, burst_minutes: burstMinutes, burst_min_authors: burstMinAuthors, limit },
    summary: {
      window: w.label, comments_checked: totals?.comments ?? 0, accounts_checked: totals?.authors ?? 0, posts_checked: totals?.posts ?? 0,
      patterns: matched, by_kind: byKind, signal: matched ? "patterns found; read each one before calling it seeding" : "no coordinated pattern found",
      rule: `same wording: identical text (15+ characters) from >= ${minAuthors} accounts; repeat account: >= ${minRepeats} comments across >= 2 posts; burst: >= ${burstMinAuthors} accounts whose only comment lands on one post within ${burstMinutes} minutes`,
    },
    rows: out,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [SUBJECT_REPLIES_CAVEAT, "These are patterns, not proof: an organic pile-on also produces bursts and repeated phrases (quoted lines, memes). Coordinated activity shows as the same wording on several posts from accounts with no other history here.", "Accounts are compared by handle within one platform; the same person on two platforms counts twice.", "YouTube comment times come rounded (\"21 hours ago\"), so bursts are not measured there; wording and repeat-account patterns still are."],
  };
};
