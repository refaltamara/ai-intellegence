/**
 * Facts for the crisis slides of a PR deck (Refal, 7 Oct 2026): what a team in the middle
 * of a case wants beside the reputation summary. Every number is counted here in SQL over
 * the deck's period, in the workspace's time zone; the slides only draw them.
 *
 * - pace: posts and comments per hour (per day when the period runs past three days)
 * - motion: the same, by the labeller's voice (Malaysian, Indonesian, …)
 * - moving: the most commented posts, and how many comments they still took at the end
 * - exposure: the subject's partner brands and the boycott words, named in posts and comments
 * - anger: comments under the subject's own posts against everyone else's
 * - chronology: how it spread, as dated events
 */
import { SkillDb } from "../skills/db";
import type { Commercial } from "../workspace/config";

export type Bin = { t: string; posts: number; against: number; comments: number; negative: number; labelled: number };
export type MotionBin = { t: string; voices: Record<string, { n: number; negative: number; labelled: number }> };
export type MovingPost = { url: string; handle: string | null; own: boolean; caption: string; posted_at: string; stance: string | null; likes: number | null; comments: number; last24: number; last6: number; negative: number; labelled: number };
export type Exposure = {
  partners: { name: string; posts: number; comments: number; negative: number; labelled: number; first: string | null }[];
  boycott: { posts: number; comments: number; first: string | null; quotes: { text: string; likes: number; url: string; voice: string | null }[] };
};
export type Anger = { own: { n: number; negative: number; positive: number; labelled: number }; others: { n: number; negative: number; positive: number; labelled: number }; own_posts: { url: string; caption: string; posted_at: string; comments: number; negative: number; labelled: number }[] };
export type ChronoEvent = { at: string; kind: "first" | "boycott" | "partner" | "own" | "peak" | "top" | "voice"; what: string; detail: string; url?: string };
export type CaseFacts = { unit: "hour" | "day"; end: string | null; pace: Bin[]; motion: MotionBin[]; voices: string[]; moving: MovingPost[]; exposure: Exposure | null; anger: Anger; chronology: ChronoEvent[] };

const n = (v: unknown) => Number(v ?? 0) || 0;
const clip = (s: unknown, k: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > k ? t.slice(0, k - 1) + "…" : t;
};

export async function caseFacts(ws: string, o: { from: string; to: string; focus: string; platform: string; tz: string; commercial: Commercial }, db: SkillDb = new SkillDb()): Promise<CaseFacts> {
  const days = Math.round((Date.parse(o.to) - Date.parse(o.from)) / 86_400_000) + 1;
  const unit: "hour" | "day" = days <= 3 ? "hour" : "day";
  const plat = o.platform === "all" ? null : o.platform;
  // $1 ws, $2 tz, $3 from, $4 to, $5 focus, $6 platform
  const base = [ws, o.tz, o.from, o.to, o.focus, plat];
  const inWin = (col: string) => `${col} >= ($3::date::timestamp at time zone $2) and ${col} < (($4::date + 1)::timestamp at time zone $2)`;
  const postsWhere = `p.workspace_id = $1 and p.brand_id = $5 and p.relevant is not false and p.brought_in_by = 'panel' and p.content_type is distinct from 'stub' and ($6::text is null or p.platform = $6)`;
  const commentsWhere = `c.workspace_id = $1 and p.brand_id = $5 and p.relevant is not false and p.brought_in_by = 'panel' and c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false) and ($6::text is null or c.platform = $6)`;
  const bucket = (col: string) => `to_char(date_trunc('${unit}', ${col} at time zone $2), '${unit === "hour" ? "YYYY-MM-DD HH24:00" : "YYYY-MM-DD"}')`;

  const endRow = await db.one<{ end: string | null }>(
    `select to_char(greatest((select max(c.posted_at) from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")}),
                             (select max(p.posted_at) from posts p where ${postsWhere} and ${inWin("p.posted_at")})) at time zone $2, 'YYYY-MM-DD HH24:MI') as end`,
    base,
  );
  const end = endRow?.end ?? null;

  // pace: every bin from the first post or comment in the window to the last one
  const pace = await db.q<Bin>(
    `with ps as (select ${bucket("p.posted_at")} as t, count(*)::int as posts, count(*) filter (where p.source = 'earned' and p.stance_source = 'model' and p.stance = 'negative')::int as against
                 from posts p where ${postsWhere} and p.source = 'earned' and ${inWin("p.posted_at")} group by 1),
          cs as (select ${bucket("c.posted_at")} as t, count(*)::int as comments, count(*) filter (where c.sentiment = 'negative')::int as negative, count(c.sentiment)::int as labelled
                 from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} group by 1)
     select coalesce(ps.t, cs.t) as t, coalesce(ps.posts, 0) as posts, coalesce(ps.against, 0) as against, coalesce(cs.comments, 0) as comments, coalesce(cs.negative, 0) as negative, coalesce(cs.labelled, 0) as labelled
     from ps full join cs on cs.t = ps.t order by 1`,
    base,
  );

  // motion: posts and comments together, by voice, per bin
  const motionRows = await db.q<{ t: string; voice: string; n: number; negative: number; labelled: number }>(
    `select t, voice, count(*)::int as n, count(*) filter (where s = 'negative')::int as negative, count(s)::int as labelled from (
       select ${bucket("p.posted_at")} as t, coalesce(p.voice, 'unclear') as voice, case when p.stance_source = 'model' then p.stance end as s
       from posts p where ${postsWhere} and p.source = 'earned' and ${inWin("p.posted_at")}
       union all
       select ${bucket("c.posted_at")}, coalesce(c.voice, 'unclear'), c.sentiment
       from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")}) x
     group by 1, 2 order by 1`,
    base,
  );
  const voiceTotals = new Map<string, number>();
  for (const r of motionRows) voiceTotals.set(r.voice, (voiceTotals.get(r.voice) ?? 0) + n(r.n));
  const named = [...voiceTotals.keys()].filter((v) => v !== "unclear");
  const voices = named.length ? [...named.sort((a, b) => (voiceTotals.get(b) ?? 0) - (voiceTotals.get(a) ?? 0)), ...(voiceTotals.has("unclear") ? ["unclear"] : [])] : [];
  const motion: MotionBin[] = voices.length
    ? [...new Set(motionRows.map((r) => r.t))].map((t) => ({ t, voices: Object.fromEntries(motionRows.filter((r) => r.t === t).map((r) => [r.voice, { n: n(r.n), negative: n(r.negative), labelled: n(r.labelled) }])) }))
    : [];

  // moving: the most commented posts in the window, and what they took in the last 24 and 6 hours of it
  const moving = (await db.q(
    `with e as (select coalesce(max(c.posted_at), (($4::date + 1)::timestamp at time zone $2)) as at
                from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")})
     select p.url, p.creator_handle as handle, p.source = 'owned' as own, p.caption, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at,
            case when p.stance_source = 'model' then p.stance end as stance, p.likes,
            count(*)::int as comments, count(*) filter (where c.posted_at > (select at from e) - interval '24 hours')::int as last24,
            count(*) filter (where c.posted_at > (select at from e) - interval '6 hours')::int as last6,
            count(*) filter (where c.sentiment = 'negative')::int as negative, count(c.sentiment)::int as labelled
     from comments c join posts p on p.id = c.post_id
     where ${commentsWhere} and ${inWin("c.posted_at")}
     group by p.id order by comments desc limit 8`,
    base,
  )).map((r): MovingPost => ({ url: String(r.url), handle: (r.handle as string) ?? null, own: !!r.own, caption: clip(r.caption, 160), posted_at: String(r.posted_at), stance: (r.stance as string) ?? null, likes: r.likes == null ? null : n(r.likes), comments: n(r.comments), last24: n(r.last24), last6: n(r.last6), negative: n(r.negative), labelled: n(r.labelled) }));

  // exposure: partners named and the boycott words, over the window
  let exposure: Exposure | null = null;
  if (o.commercial.partners.length || o.commercial.boycott_terms.length) {
    const like = (terms: string[]) => terms.map((t) => `%${t}%`);
    const partners = await db.q(
      `with pat as (select name, terms from jsonb_to_recordset($7::jsonb) as x(name text, terms text[]))
       select pat.name,
              (select count(*) from posts p where ${postsWhere} and p.source = 'earned' and ${inWin("p.posted_at")} and p.caption ilike any(pat.terms))::int as posts,
              (select count(*) from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} and c.text ilike any(pat.terms))::int as comments,
              (select count(*) from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} and c.text ilike any(pat.terms) and c.sentiment = 'negative')::int as negative,
              (select count(c.sentiment) from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} and c.text ilike any(pat.terms))::int as labelled,
              (select to_char(min(t) at time zone $2, 'YYYY-MM-DD HH24:MI') from (
                 select min(p.posted_at) as t from posts p where ${postsWhere} and p.source = 'earned' and ${inWin("p.posted_at")} and p.caption ilike any(pat.terms)
                 union all select min(c.posted_at) from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} and c.text ilike any(pat.terms)) f) as first
       from pat`,
      [...base, JSON.stringify(o.commercial.partners.map((p) => ({ name: p.name, terms: like(p.terms) })))],
    );
    const b = like(o.commercial.boycott_terms);
    const bt = await db.one(
      `select (select count(*) from posts p where ${postsWhere} and p.source = 'earned' and ${inWin("p.posted_at")} and p.caption ilike any($7::text[]))::int as posts,
              (select count(*) from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} and c.text ilike any($7::text[]))::int as comments,
              (select to_char(min(t) at time zone $2, 'YYYY-MM-DD HH24:MI') from (
                 select min(p.posted_at) as t from posts p where ${postsWhere} and p.source = 'earned' and ${inWin("p.posted_at")} and p.caption ilike any($7::text[])
                 union all select min(c.posted_at) from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} and c.text ilike any($7::text[])) f) as first`,
      [...base, b],
    );
    const quotes = await db.q(
      `select p.caption as text, coalesce(p.likes, 0)::int as likes, p.url, p.voice from posts p
       where ${postsWhere} and p.source = 'earned' and ${inWin("p.posted_at")} and p.caption ilike any($7::text[]) order by p.likes desc nulls last limit 3`,
      [...base, b],
    );
    exposure = {
      partners: partners.map((r) => ({ name: String(r.name), posts: n(r.posts), comments: n(r.comments), negative: n(r.negative), labelled: n(r.labelled), first: (r.first as string) ?? null })).sort((a, b2) => b2.posts + b2.comments - (a.posts + a.comments)),
      boycott: { posts: n(bt?.posts), comments: n(bt?.comments), first: (bt?.first as string) ?? null, quotes: quotes.map((r) => ({ text: clip(r.text, 200), likes: n(r.likes), url: String(r.url), voice: (r.voice as string) ?? null })) },
    };
  }

  // anger: under the subject's own posts against everyone else's
  const angerRows = await db.q(
    `select p.source = 'owned' as own, count(*)::int as n, count(*) filter (where c.sentiment = 'negative')::int as negative,
            count(*) filter (where c.sentiment = 'positive')::int as positive, count(c.sentiment)::int as labelled
     from comments c join posts p on p.id = c.post_id where ${commentsWhere} and ${inWin("c.posted_at")} group by 1`,
    base,
  );
  const side = (own: boolean) => {
    const r = angerRows.find((x) => !!x.own === own);
    return { n: n(r?.n), negative: n(r?.negative), positive: n(r?.positive), labelled: n(r?.labelled) };
  };
  const ownPosts = (await db.q(
    `select p.url, p.caption, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at, count(c.id)::int as comments,
            count(c.id) filter (where c.sentiment = 'negative')::int as negative, count(c.sentiment)::int as labelled
     from posts p join comments c on c.post_id = p.id and c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false) and ${inWin("c.posted_at")}
     where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.brand_id = $5 and p.source = 'owned' and ($6::text is null or p.platform = $6)
     group by p.id order by comments desc limit 4`,
    base,
  )).map((r) => ({ url: String(r.url), caption: clip(r.caption, 140), posted_at: String(r.posted_at), comments: n(r.comments), negative: n(r.negative), labelled: n(r.labelled) }));
  const anger: Anger = { own: side(true), others: side(false), own_posts: ownPosts };

  // chronology: dated events, oldest first
  const events: ChronoEvent[] = [];
  const first = await db.one(
    `select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, p.creator_handle as handle, p.caption, p.url from posts p
     where ${postsWhere} and p.source = 'earned' and p.stance_source = 'model' and p.stance is not null and ${inWin("p.posted_at")} order by p.posted_at limit 1`,
    base,
  );
  if (first) events.push({ at: String(first.at), kind: "first", what: `First post about it in the period: @${first.handle}`, detail: clip(first.caption, 110), url: String(first.url) });
  if (exposure?.boycott.first) events.push({ at: exposure.boycott.first, kind: "boycott", what: "First call to boycott", detail: `${exposure.boycott.posts} posts and ${exposure.boycott.comments} comments use a boycott word in the period` });
  for (const p of exposure?.partners ?? []) if (p.first) events.push({ at: p.first, kind: "partner", what: `${p.name} first named`, detail: `${p.posts} posts and ${p.comments} comments name it in the period` });
  const own = await db.q(
    `select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, p.creator_handle as handle, p.caption, p.url from posts p
     where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.brand_id = $5 and p.source = 'owned' and ($6::text is null or p.platform = $6) and ${inWin("p.posted_at")} order by p.posted_at limit 4`,
    base,
  );
  for (const r of own) events.push({ at: String(r.at), kind: "own", what: `@${r.handle} posts`, detail: clip(r.caption, 110), url: String(r.url) });
  // the first hour each voice took a majority of the talk (where voices are read)
  if (voices.length > 1 && motion.length) {
    const seen = new Set<string>();
    for (const b of motion) {
      const tot = Object.values(b.voices).reduce((a, x) => a + x.n, 0);
      if (tot < 20) continue;
      for (const v of voices.filter((x) => x !== "unclear")) {
        const x = b.voices[v];
        if (x && !seen.has(v) && x.n * 2 > tot) {
          seen.add(v);
          events.push({ at: b.t, kind: "voice", what: `${v} voices take over`, detail: `${x.n} of ${tot} posts and comments that ${unit}` });
        }
      }
    }
  }
  const peak = pace.reduce<Bin | null>((a, b) => (!a || b.posts + b.comments > a.posts + a.comments ? b : a), null);
  if (peak && peak.posts + peak.comments > 0) events.push({ at: peak.t, kind: "peak", what: `Busiest ${unit}`, detail: `${peak.posts} posts and ${peak.comments} comments` });
  const tops = await db.q(
    `select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, p.creator_handle as handle, p.caption, p.url, p.likes, p.comments_count from posts p
     where ${postsWhere} and p.source = 'earned' and p.stance_source = 'model' and ${inWin("p.posted_at")} order by coalesce(p.views, 0) + coalesce(p.likes, 0) * 20 desc limit 4`,
    base,
  );
  for (const r of tops) events.push({ at: String(r.at), kind: "top", what: `@${r.handle} posts: “${clip(r.caption, 70)}”`, detail: `${n(r.likes).toLocaleString("en-US")} likes · ${n(r.comments_count).toLocaleString("en-US")} replies`, url: String(r.url) });
  const seenAt = new Set<string>();
  const chronology = events.sort((a, b) => a.at.localeCompare(b.at)).filter((e) => {
    const k = e.kind + e.at + e.what;
    if (seenAt.has(k)) return false;
    seenAt.add(k);
    return true;
  }).slice(0, 14);

  return { unit, end, pace, motion, voices, moving, exposure, anger, chronology };
}
