/**
 * Day by day, and posts to watch (Refal, 22 Oct 2026: "track it on a daily basis ... all Kahf own accounts & the
 * mentions ... especially on Malaysia"; "specific for that content apology this morning ... create one section for
 * it"). Both are read around one subject only (a case workspace, `settings.label.about`) and only for the dashboard,
 * never for decks. Every number is counted here in SQL; the page only lays them out.
 *
 *   daily    each day of the window up to the newest data: the subject's own posts (by account) and the comments on
 *            them, posts by others about the subject and how many are against it, the comments about it and how many
 *            are negative, and each side by the labeller's voice (Malaysian, Indonesian: read from the language)
 *   watched  the posts listed in `settings.pr.watch` ({ url, label }): the post as last read, the comments under it
 *            by their own label and by voice, the pace since it went up, and the most-liked comments on each side
 */
import type { SkillDb } from "../skills/db";

export type Lean = { n: number; read: number; negative: number; positive: number };
export type DailyRow = {
  d: string;
  /** the day's comments are still arriving (after the dashboard's last settled day) */
  arriving: boolean;
  own: { n: number; by: Record<string, number>; comments: Lean };
  /** posts by other accounts about the subject: read = carry a stance; negative = against, positive = defending */
  mentions: Lean;
  /** comments about the subject, under any post, each by its own label */
  comments: Lean;
  /** comments in the same threads about something else */
  other: number;
  voices: Record<string, { posts: Lean; comments: Lean }>;
};
export type Daily = { from: string; to: string; voices: string[]; handles: string[]; rows: DailyRow[] };

export type WatchQuote = { text: string; likes: number; sentiment: string | null; voice: string | null };
export type Watched = {
  label: string | null;
  url: string;
  platform: string;
  handle: string | null;
  source: string;
  caption: string;
  posted_at: string;
  /** as the post was last read: what the platform showed then */
  views: number | null;
  likes: number | null;
  reported_comments: number | null;
  shares: number | null;
  read_at: string | null;
  /** comments loaded under it, apart from the subject's own replies */
  comments: Lean;
  other: number;
  own_replies: number;
  first_comment: string | null;
  last_comment: string | null;
  first_after_min: number | null;
  voices: ({ voice: string } & Lean)[];
  bucket: "hour" | "day";
  series: { at: string; n: number; negative: number }[];
  peak: { at: string; n: number } | null;
  /** the most-liked comments against the subject, and defending it */
  against: WatchQuote[];
  defending: WatchQuote[];
};

const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const lean = (): Lean => ({ n: 0, read: 0, negative: 0, positive: 0 });
const add = (a: Lean, r: Record<string, unknown>) => { a.n += n(r.n); a.read += n(r.read); a.negative += n(r.negative); a.positive += n(r.positive); };
const nextDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);

/**
 * Each day from `from` (or the first day the data has, if later) to `to`. $1 workspace, $2 tz, $3 platform or null,
 * $4 the subject's brand, $5 from, $6 to. `under` is the comment rule (commentsUnder in dashboard.ts).
 */
export async function dailyFacts(db: SkillDb, ws: string, tz: string, brand: string, from: string, to: string, settled: string, platform: string | null, under: string): Promise<Daily> {
  const args = [ws, tz, platform, brand, from, to];
  const window = (col: string) => `${col} >= ($5::date::timestamp at time zone $2) and ${col} < (($6::date + 1)::timestamp at time zone $2)`;
  const [postRows, ownRows, commentRows] = await Promise.all([
    db.q(`select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as d, coalesce(p.voice, 'unclear') as voice, count(*)::int as n,
                 count(*) filter (where p.stance_source = 'model' and p.stance is not null)::int as read,
                 count(*) filter (where p.stance_source = 'model' and p.stance = 'negative')::int as negative,
                 count(*) filter (where p.stance_source = 'model' and p.stance = 'positive')::int as positive
          from posts p
          where p.workspace_id = $1 and p.brand_id = $4 and p.source = 'earned' and p.relevant is not false and p.brought_in_by = 'panel'
            and ($3::text is null or p.platform = $3) and ${window("p.posted_at")}
          group by 1, 2`, args),
    db.q(`select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as d, lower(coalesce(p.creator_handle, '')) as handle, count(*)::int as n
          from posts p
          where p.workspace_id = $1 and p.brand_id = $4 and p.source = 'owned' and p.brought_in_by = 'panel' and ($3::text is null or p.platform = $3) and ${window("p.posted_at")}
          group by 1, 2`, args),
    db.q(`select to_char(c.posted_at at time zone $2, 'YYYY-MM-DD') as d, coalesce(c.voice, 'unclear') as voice, p.source = 'owned' as on_own,
                 count(*) filter (where not coalesce(c.off_topic, false))::int as n,
                 count(c.sentiment) filter (where not coalesce(c.off_topic, false))::int as read,
                 count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative')::int as negative,
                 count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'positive')::int as positive,
                 count(*) filter (where c.off_topic)::int as other
          from comments c join posts p on p.id = c.post_id
          where c.workspace_id = $1 and ${under} and p.brand_id = $4 and c.sentiment_source is distinct from 'subject' and c.posted_at is not null
            and ($3::text is null or c.platform = $3) and ${window("c.posted_at")}
          group by 1, 2, 3`, args),
  ]);
  const days = [...new Set([...postRows, ...ownRows, ...commentRows].map((r) => String(r.d)))].sort();
  const first = days[0] && days[0] > from ? days[0] : from;
  const voices = [...new Set([...postRows, ...commentRows].map((r) => String(r.voice)))].sort((a, b) => Number(a === "unclear") - Number(b === "unclear") || a.localeCompare(b));
  const rows: DailyRow[] = [];
  for (let d = first; d <= to; d = nextDay(d)) {
    const row: DailyRow = { d, arriving: d > settled, own: { n: 0, by: {}, comments: lean() }, mentions: lean(), comments: lean(), other: 0, voices: {} };
    for (const v of voices) row.voices[v] = { posts: lean(), comments: lean() };
    for (const r of ownRows.filter((x) => x.d === d)) { row.own.n += n(r.n); row.own.by[String(r.handle)] = (row.own.by[String(r.handle)] ?? 0) + n(r.n); }
    for (const r of postRows.filter((x) => x.d === d)) { add(row.mentions, r); add(row.voices[String(r.voice)].posts, r); }
    for (const r of commentRows.filter((x) => x.d === d)) {
      add(row.comments, r);
      add(row.voices[String(r.voice)].comments, r);
      if (r.on_own) add(row.own.comments, r);
      row.other += n(r.other);
    }
    rows.push(row);
  }
  return { from: first, to, voices, handles: [...new Set(ownRows.map((r) => String(r.handle)))].sort(), rows };
}

/** a watched url as the loader stores it: host lowercased without www, threads.net as threads.com, no query or trailing slash */
export function watchUrl(raw: string): string | null {
  const m = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(raw.trim());
  if (!m) return null;
  let host = m[1].toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (host === "threads.net") host = "threads.com";
  if (host === "twitter.com") host = "x.com";
  return `https://${host}${m[2].replace(/\/+$/, "")}`;
}

/** `settings.pr.watch` as given: a list of { url, label? }; anything else is left out */
export function readWatch(v: unknown): { url: string; label: string | null }[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const url = x && typeof x === "object" && typeof (x as { url?: unknown }).url === "string" ? watchUrl((x as { url: string }).url) : null;
    const label = x && typeof (x as { label?: unknown }).label === "string" ? String((x as { label: string }).label).slice(0, 80) : null;
    return url ? [{ url, label }] : [];
  }).slice(0, 6);
}

/** Each watched post with its comments. $1 workspace, then the zone and the post's id (or the post's id alone). */
export async function watchedPosts(db: SkillDb, ws: string, tz: string, watch: { url: string; label: string | null }[]): Promise<Watched[]> {
  if (!watch.length) return [];
  const posts = await db.q(
    `select p.id, p.url, p.platform, p.creator_handle as handle, p.source, coalesce(p.caption, '') as caption,
            to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at, extract(epoch from p.posted_at)::float8 as ep,
            p.views::float8 as views, p.likes, p.comments_count, p.shares, to_char(p.read_at at time zone $2, 'YYYY-MM-DD HH24:MI') as read_at
     from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.url = any($3::text[])`,
    [ws, tz, watch.map((w) => w.url)],
  );
  const out = await Promise.all(watch.map(async (w): Promise<Watched | null> => {
    const p = posts.find((r) => r.url === w.url);
    if (!p) return null;
    // the queries that read times take the zone as $2 and the post as $3; the others take the post as $2
    const args = [ws, tz, p.id];
    const argsNoTz = [ws, p.id];
    const aboutOf = (post: string) => `c.post_id = ${post} and c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false)`;
    const about = aboutOf("$3");
    const [tot, voiceRows, hourRows, againstRows, defRows] = await Promise.all([
      db.one(`select count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment_source is distinct from 'subject')::int as n,
                     count(c.sentiment) filter (where not coalesce(c.off_topic, false) and c.sentiment_source is distinct from 'subject')::int as read,
                     count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative')::int as negative,
                     count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'positive')::int as positive,
                     count(*) filter (where c.off_topic and c.sentiment_source is distinct from 'subject')::int as other,
                     count(*) filter (where c.sentiment_source = 'subject')::int as own_replies,
                     to_char(min(c.posted_at) filter (where c.sentiment_source is distinct from 'subject') at time zone $2, 'YYYY-MM-DD HH24:MI') as first_at,
                     to_char(max(c.posted_at) filter (where c.sentiment_source is distinct from 'subject') at time zone $2, 'YYYY-MM-DD HH24:MI') as last_at,
                     extract(epoch from min(c.posted_at) filter (where c.sentiment_source is distinct from 'subject'))::float8 as first_ep
              from comments c where c.post_id = $3 and c.workspace_id = $1`, args),
      db.q(`select coalesce(c.voice, 'unclear') as voice, count(*)::int as n, count(c.sentiment)::int as read,
                   count(*) filter (where c.sentiment = 'negative')::int as negative, count(*) filter (where c.sentiment = 'positive')::int as positive
            from comments c where ${aboutOf("$2")} group by 1`, argsNoTz),
      db.q(`select to_char(date_trunc('hour', c.posted_at at time zone $2), 'YYYY-MM-DD HH24:00') as h, count(*)::int as n, count(*) filter (where c.sentiment = 'negative')::int as negative
            from comments c where ${about} and c.posted_at is not null group by 1 order by 1`, args),
      db.q(`select c.text, coalesce(c.likes, 0)::int as likes, c.sentiment, c.voice from comments c
            where ${aboutOf("$2")} and c.sentiment = 'negative' and c.text is not null order by coalesce(c.likes, 0) desc, length(c.text) desc limit 2`, argsNoTz),
      db.q(`select c.text, coalesce(c.likes, 0)::int as likes, c.sentiment, c.voice from comments c
            where ${aboutOf("$2")} and c.sentiment = 'positive' and c.text is not null order by coalesce(c.likes, 0) desc, length(c.text) desc limit 2`, argsNoTz),
    ]);
    const hours = hourRows.map((r) => ({ at: String(r.h), n: n(r.n), negative: n(r.negative) }));
    const t = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");
    const span = hours.length ? (t(hours.at(-1)!.at) - t(hours[0].at)) / 3600000 + 1 : 0;
    let bucket: "hour" | "day" = "hour";
    let series = hours;
    if (span > 48) {
      bucket = "day";
      const byDay = new Map<string, { n: number; negative: number }>();
      for (const h of hours) { const k = h.at.slice(0, 10); const cur = byDay.get(k) ?? { n: 0, negative: 0 }; cur.n += h.n; cur.negative += h.negative; byDay.set(k, cur); }
      series = [...byDay.entries()].map(([at, v]) => ({ at, ...v }));
    } else if (hours.length) {
      // every hour from the first to the last, quiet ones as zero, so the bars read as time
      const have = new Map(hours.map((h) => [h.at, h]));
      series = Array.from({ length: span }, (_, k) => {
        const at = new Date(t(hours[0].at) + k * 3600000).toISOString().slice(0, 13).replace("T", " ") + ":00";
        return have.get(at) ?? { at, n: 0, negative: 0 };
      });
    }
    const peak = series.reduce<{ at: string; n: number } | null>((m, h) => (!m || h.n > m.n ? { at: h.at, n: h.n } : m), null);
    const quote = (r: Record<string, unknown>): WatchQuote => ({ text: String(r.text).replace(/\s+/g, " ").trim(), likes: n(r.likes), sentiment: (r.sentiment as string) ?? null, voice: (r.voice as string) ?? null });
    return {
      label: w.label, url: String(p.url), platform: String(p.platform), handle: (p.handle as string) ?? null, source: String(p.source), caption: String(p.caption), posted_at: String(p.posted_at),
      views: nn(p.views), likes: nn(p.likes), reported_comments: nn(p.comments_count), shares: nn(p.shares), read_at: (p.read_at as string) ?? null,
      comments: { n: n(tot?.n), read: n(tot?.read), negative: n(tot?.negative), positive: n(tot?.positive) },
      other: n(tot?.other), own_replies: n(tot?.own_replies), first_comment: (tot?.first_at as string) ?? null, last_comment: (tot?.last_at as string) ?? null,
      first_after_min: tot?.first_ep != null && p.ep != null ? Math.max(0, Math.round((Number(tot.first_ep) - Number(p.ep)) / 60)) : null,
      voices: voiceRows.map((r) => ({ voice: String(r.voice), n: n(r.n), read: n(r.read), negative: n(r.negative), positive: n(r.positive) }))
        .sort((a, b) => Number(a.voice === "unclear") - Number(b.voice === "unclear") || b.n - a.n),
      bucket, series, peak: peak && peak.n > 0 ? peak : null,
      against: againstRows.map(quote), defending: defRows.map(quote),
    };
  }));
  return out.filter((x): x is Watched => !!x);
}
