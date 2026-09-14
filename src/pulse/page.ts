/**
 * Pulse: the crisis dashboard for a profile workspace (Refal, 14 Sep 2026). One
 * subject, every platform, comments first. Everything here is computed in SQL
 * or by the comment-layer skills; the page only lays it out.
 */
import { PLATFORM_LABEL } from "../skills/common";
import { SkillDb } from "../skills/db";
import { runSkill } from "../skills/runner";
import type { Row, SkillResult } from "../skills/types";
import { getWorkspace } from "../workspace/store";

export const PLATFORMS = ["youtube", "threads", "instagram", "tiktok", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type PulseEvent = { at: string; platform: string; what: string; detail: string; url?: string; kind: "root" | "first" | "reply" | "takeoff" | "peak" | "top" };
export type SpreadRow = { platform: string; first_post: string | null; first_post_handle: string | null; first_comment: string | null; takeoff: string | null; peak_hour: string | null; peak_comments: number; posts: number; comments: number; negative: number; labelled: number };
export type StanceRow = { platform: string; posts: number; against: number; neutral: number; for_: number; unlabelled: number; views_total: number; views_against: number; views_for: number; views_neutral: number; likes_total: number; likes_against: number; likes_for: number; likes_neutral: number };
export type Commenters = {
  accounts: number; comments: number;
  once: number; few: number; many: number;            // accounts with 1, 2-4, 5+ comments
  comments_from_once: number; comments_from_many: number;
  cross_post: number; cross_platform: number;
  top: { platform: string; handle: string; comments: number; posts: number; likes: number; negative: number }[];
  first_time: { x: string[]; series: { name: string; data: (number | null)[] }[] };
};
export type ReplyEffect = { at: string; before: { comments: number; labelled: number; negative: number }; after: { comments: number; labelled: number; negative: number }; same_platform: { platform: string; before: { comments: number; labelled: number; negative: number }; after: { comments: number; labelled: number; negative: number } } } | null;

export type PulseData = {
  subject: string;
  productName: string;
  tz: string;
  asOf: string;
  totals: { posts: number; earned_posts: number; comments: number; labelled: number; negative: number; neutral: number; positive: number; accounts: number; platforms: number };
  root: { url: string; posted_at: string; caption: string; views: number | null; likes: number | null; comments: number; early_comments: number } | null;
  reply: { at: string; likes: number; text: string } | null;
  hourly: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  negative_trend: { x: string[]; series: { name: string; data: (number | null)[] }[] };
  posts_hourly: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  posts_hourly_stance: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  posts_daily: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  stance: StanceRow[];
  commenters: Commenters;
  reply_effect: ReplyEffect;
  daily: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  events: PulseEvent[];
  spread: SpreadRow[];
  sentiment: SkillResult;
  drivers: SkillResult;
  themes: SkillResult;
  seeding: SkillResult;
};

const label = (p: string) => PLATFORM_LABEL[p] ?? p;

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: PulseData }>();

export async function pulsePage(ws: string): Promise<PulseData | null> {
  const hit = cache.get(ws);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await build(ws);
  if (data) cache.set(ws, { at: Date.now(), data });
  return data;
}

async function build(ws: string): Promise<PulseData | null> {
  const cfg = await getWorkspace(ws);
  if (!cfg || cfg.kind !== "profile") return null;
  const db = new SkillDb();
  const tz = cfg.tz;
  const subject = (await db.one<{ name: string }>("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [ws]))?.name ?? cfg.name;

  const totals = await db.one<PulseData["totals"]>(
    `select (select count(*) from posts where workspace_id = $1 and content_type is distinct from 'stub')::int as posts,
            (select count(*) from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub')::int as earned_posts,
            (select count(*) from comments where workspace_id = $1 and sentiment_source is distinct from 'subject')::int as comments,
            (select count(*) from comments where workspace_id = $1 and sentiment is not null)::int as labelled,
            (select count(*) from comments where workspace_id = $1 and sentiment = 'negative')::int as negative,
            (select count(*) from comments where workspace_id = $1 and sentiment = 'neutral')::int as neutral,
            (select count(*) from comments where workspace_id = $1 and sentiment = 'positive')::int as positive,
            (select count(distinct (platform, author_handle)) from comments where workspace_id = $1 and sentiment_source is distinct from 'subject')::int as accounts,
            (select count(distinct platform) from comments where workspace_id = $1)::int as platforms`,
    [ws],
  );
  const asOf = (await db.one<{ t: string }>(`select to_char(max(posted_at) at time zone $2, 'YYYY-MM-DD HH24:MI') as t from comments where workspace_id = $1`, [ws, tz]))?.t ?? "";

  // the root: the owned post with the most comments
  const rootRow = await db.one<Row>(
    `select p.url, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at, p.caption, p.views::float8 as views, p.likes, p.platform,
            (select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')::int as comments,
            (select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject' and c.posted_at < p.posted_at + interval '14 days')::int as early_comments
     from posts p where p.workspace_id = $1 and p.source = 'owned' order by comments desc limit 1`,
    [ws, tz],
  );
  const root = rootRow ? { url: rootRow.url as string, posted_at: rootRow.posted_at as string, caption: String(rootRow.caption ?? "").replace(/\s+/g, " ").slice(0, 220), views: rootRow.views as number | null, likes: rootRow.likes as number | null, comments: rootRow.comments as number, early_comments: rootRow.early_comments as number, platform: rootRow.platform as string } : null;
  const replyRow = await db.one<Row>(`select to_char(posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, coalesce(likes, 0)::int as likes, text, platform from comments where workspace_id = $1 and sentiment_source = 'subject' order by likes desc nulls last limit 1`, [ws, tz]);
  const reply = replyRow && (replyRow.likes as number) > 0 ? { at: replyRow.at as string, likes: replyRow.likes as number, text: String(replyRow.text).replace(/\s+/g, " ").slice(0, 240), platform: replyRow.platform as string } : null;

  // before and after the subject's reply: did the mood move?
  let reply_effect: ReplyEffect = null;
  if (reply) {
    const split = async (platform: string | null) => {
      const r = await db.one<Row>(
        `select count(*) filter (where c.posted_at < r.at)::int as b_comments, count(*) filter (where c.posted_at < r.at and c.sentiment is not null)::int as b_labelled,
                count(*) filter (where c.posted_at < r.at and c.sentiment = 'negative')::int as b_negative,
                count(*) filter (where c.posted_at >= r.at)::int as a_comments, count(*) filter (where c.posted_at >= r.at and c.sentiment is not null)::int as a_labelled,
                count(*) filter (where c.posted_at >= r.at and c.sentiment = 'negative')::int as a_negative
         from comments c, (select posted_at as at from comments where workspace_id = $1 and sentiment_source = 'subject' order by likes desc nulls last limit 1) r
         where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.posted_at >= r.at - interval '3 days' ${platform ? "and c.platform = $2" : ""}`,
        platform ? [ws, platform] : [ws],
      );
      return { before: { comments: r?.b_comments as number, labelled: r?.b_labelled as number, negative: r?.b_negative as number }, after: { comments: r?.a_comments as number, labelled: r?.a_labelled as number, negative: r?.a_negative as number } };
    };
    const [all, same] = await Promise.all([split(null), split(reply.platform)]);
    reply_effect = { at: reply.at, ...all, same_platform: { platform: reply.platform, ...same } };
  }

  // hourly, last 72 h ending at the newest comment; daily since the root post
  const hours = await db.q<Row>(
    `with bounds as (select date_trunc('hour', max(posted_at) at time zone $2) as last from comments where workspace_id = $1),
     hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h)
     select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, c.platform, count(c.id)::int as n
     from hrs left join comments c on c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and date_trunc('hour', c.posted_at at time zone $2) = hrs.h
     group by 1, 2 order by 1`,
    [ws, tz],
  );
  const hourly = pivot(hours, "h");
  // posts by other accounts per hour and per day: the density of the conversation, not only its replies
  const postHours = await db.q<Row>(
    `with bounds as (select date_trunc('hour', max(posted_at) at time zone $2) as last from comments where workspace_id = $1),
     hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h)
     select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, p.platform, coalesce(p.stance, 'unlabelled') as stance, count(p.id)::int as n
     from hrs left join posts p on p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and date_trunc('hour', p.posted_at at time zone $2) = hrs.h
     group by 1, 2, 3 order by 1`,
    [ws, tz],
  );
  const posts_hourly = pivot(postHours, "h");
  const stanceX = [...new Set(postHours.map((r) => r.h as string))];
  const stanceNames: Record<string, string> = { negative: "Against", neutral: "Neutral", positive: "For", unlabelled: "Unlabelled" };
  const posts_hourly_stance = {
    x: stanceX,
    series: ["negative", "neutral", "positive", "unlabelled"].filter((k) => postHours.some((r) => r.stance === k && (r.n as number) > 0)).map((k) => ({ name: stanceNames[k], stack: "s", data: stanceX.map((h) => postHours.filter((r) => r.h === h && r.stance === k).reduce((a, r) => a + (r.n as number), 0)) })),
  };

  // negative share per hour on labelled comments; hours with fewer than 10 labelled stay blank
  const negHours = await db.q<Row>(
    `with bounds as (select date_trunc('hour', max(posted_at) at time zone $2) as last from comments where workspace_id = $1),
     hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h)
     select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, count(c.id) filter (where c.sentiment is not null)::int as labelled, count(c.id) filter (where c.sentiment = 'negative')::int as negative
     from hrs left join comments c on c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and date_trunc('hour', c.posted_at at time zone $2) = hrs.h
     group by 1 order by 1`,
    [ws, tz],
  );
  const negative_trend = { x: negHours.map((r) => r.h as string), series: [{ name: "Negative share of labelled comments (%)", data: negHours.map((r) => ((r.labelled as number) >= 10 ? Math.round(((r.negative as number) / (r.labelled as number)) * 1000) / 10 : null)) }] };

  // stance of the contents about the subject, weighted by reach (views where the platform reports them, likes otherwise)
  const stance = (await db.q<Row>(
    `select platform, count(*)::int as posts,
            count(*) filter (where stance = 'negative')::int as against, count(*) filter (where stance = 'neutral')::int as neutral,
            count(*) filter (where stance = 'positive')::int as for_, count(*) filter (where stance is null)::int as unlabelled,
            coalesce(sum(views), 0)::float8 as views_total, coalesce(sum(views) filter (where stance = 'negative'), 0)::float8 as views_against,
            coalesce(sum(views) filter (where stance = 'positive'), 0)::float8 as views_for, coalesce(sum(views) filter (where stance = 'neutral'), 0)::float8 as views_neutral,
            coalesce(sum(likes), 0)::int as likes_total, coalesce(sum(likes) filter (where stance = 'negative'), 0)::int as likes_against,
            coalesce(sum(likes) filter (where stance = 'positive'), 0)::int as likes_for, coalesce(sum(likes) filter (where stance = 'neutral'), 0)::int as likes_neutral
     from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub'
     group by 1 order by posts desc`,
    [ws],
  )) as unknown as StanceRow[];

  // who comments: once vs repeatedly, across posts, across platforms (by handle text), first-time share per hour
  const cm = await db.one<Row>(
    `with per_account as (
       select c.platform, c.author_handle, count(*)::int as n, count(distinct c.post_id)::int as posts
       from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.author_handle is not null group by 1, 2),
     handles as (select author_handle, count(distinct platform)::int as platforms from per_account group by 1)
     select (select count(*) from per_account)::int as accounts, (select sum(n) from per_account)::int as comments,
            count(*) filter (where n = 1)::int as once, count(*) filter (where n between 2 and 4)::int as few, count(*) filter (where n >= 5)::int as many,
            coalesce(sum(n) filter (where n = 1), 0)::int as comments_from_once, coalesce(sum(n) filter (where n >= 5), 0)::int as comments_from_many,
            count(*) filter (where posts >= 2)::int as cross_post,
            (select count(*) from handles where platforms >= 2)::int as cross_platform
     from per_account`,
    [ws],
  );
  const topCommenters = await db.q<Row>(
    `select c.platform, c.author_handle as handle, count(*)::int as comments, count(distinct c.post_id)::int as posts, coalesce(sum(c.likes), 0)::int as likes,
            count(*) filter (where c.sentiment = 'negative')::int as negative
     from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.author_handle is not null
     group by 1, 2 order by comments desc, likes desc limit 8`,
    [ws],
  );
  const firstTime = await db.q<Row>(
    `with bounds as (select date_trunc('hour', max(posted_at) at time zone $2) as last from comments where workspace_id = $1),
     hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h),
     firsts as (select platform, author_handle, min(posted_at) as first_at from comments where workspace_id = $1 and sentiment_source is distinct from 'subject' and author_handle is not null group by 1, 2)
     select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h,
            (select count(*) from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and date_trunc('hour', c.posted_at at time zone $2) = hrs.h)::int as comments,
            (select count(*) from firsts f where date_trunc('hour', f.first_at at time zone $2) = hrs.h)::int as first_timers
     from hrs order by 1`,
    [ws, tz],
  );
  const commenters: Commenters = {
    accounts: (cm?.accounts as number) ?? 0, comments: (cm?.comments as number) ?? 0,
    once: (cm?.once as number) ?? 0, few: (cm?.few as number) ?? 0, many: (cm?.many as number) ?? 0,
    comments_from_once: (cm?.comments_from_once as number) ?? 0, comments_from_many: (cm?.comments_from_many as number) ?? 0,
    cross_post: (cm?.cross_post as number) ?? 0, cross_platform: (cm?.cross_platform as number) ?? 0,
    top: topCommenters as unknown as Commenters["top"],
    first_time: { x: firstTime.map((r) => r.h as string), series: [{ name: "Comments from first-time accounts (%)", data: firstTime.map((r) => ((r.comments as number) >= 10 ? Math.round(((r.first_timers as number) / (r.comments as number)) * 1000) / 10 : null)) }] },
  };
  const sinceIso = root ? root.posted_at.slice(0, 10) : null;
  const days = await db.q<Row>(
    `with bounds as (select coalesce($3::date, (max(posted_at) - interval '30 days')::date) as first, max(posted_at)::date as last from comments where workspace_id = $1),
     ds as (select generate_series((select first from bounds), (select last from bounds), interval '1 day')::date as d)
     select to_char(ds.d, 'YYYY-MM-DD') as h, c.platform, count(c.id)::int as n
     from ds left join comments c on c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and (c.posted_at at time zone $2)::date = ds.d
     group by 1, 2 order by 1`,
    [ws, tz, sinceIso],
  );
  const daily = pivot(days, "h");
  const postDays = await db.q<Row>(
    `with bounds as (select coalesce($3::date, (max(posted_at) - interval '30 days')::date) as first, max(posted_at)::date as last from comments where workspace_id = $1),
     ds as (select generate_series((select first from bounds), (select last from bounds), interval '1 day')::date as d)
     select to_char(ds.d, 'YYYY-MM-DD') as h, p.platform, count(p.id)::int as n
     from ds left join posts p on p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and (p.posted_at at time zone $2)::date = ds.d
     group by 1, 2 order by 1`,
    [ws, tz, sinceIso],
  );
  const posts_daily = pivot(postDays, "h");

  // spread: per platform, first earned post, first comment, take-off hour (first hour with 20+), peak hour
  const spreadRows = await db.q<Row>(
    `with per_hour as (
       select c.platform, date_trunc('hour', c.posted_at at time zone $2) as h, count(*)::int as n
       from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.posted_at >= coalesce($3::date, (now() - interval '60 days')::date) group by 1, 2),
     peak as (select distinct on (platform) platform, to_char(h, 'YYYY-MM-DD HH24:00') as peak_hour, n as peak_comments from per_hour order by platform, n desc, h),
     takeoff as (select platform, to_char(min(h), 'YYYY-MM-DD HH24:00') as takeoff from per_hour where n >= 20 group by 1),
     firstpost as (select distinct on (platform) platform, to_char(posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as first_post, creator_handle as first_post_handle, url as first_post_url
                   from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub' and posted_at >= now() - interval '60 days' order by platform, posted_at),
     agg as (select c.platform, count(*)::int as comments, count(*) filter (where c.sentiment = 'negative')::int as negative, count(*) filter (where c.sentiment is not null)::int as labelled,
                    to_char(min(c.posted_at) filter (where c.posted_at >= coalesce($3::date, (now() - interval '60 days')::date)) at time zone $2, 'YYYY-MM-DD HH24:MI') as first_comment
             from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' group by 1),
     np as (select platform, count(*)::int as posts from posts where workspace_id = $1 and content_type is distinct from 'stub' group by 1)
     select a.platform, f.first_post, f.first_post_handle, f.first_post_url, a.first_comment, t.takeoff, pk.peak_hour, coalesce(pk.peak_comments, 0) as peak_comments,
            coalesce(np.posts, 0) as posts, a.comments, a.negative, a.labelled
     from agg a left join firstpost f using (platform) left join takeoff t using (platform) left join peak pk using (platform) left join np using (platform)
     order by a.comments desc`,
    [ws, tz, sinceIso],
  );
  const spread = spreadRows as unknown as (SpreadRow & { first_post_url: string | null })[];

  // the skills, unpersisted
  const actor = { user_id: "pulse", via: "api" as const };
  const [sentiment, drivers, themesNeg, seeding] = await Promise.all([
    runSkill({ skill: "sentiment", workspace_id: ws, params: { window: { last_n_days: 30 } }, actor, persist: false }),
    runSkill({ skill: "drivers", workspace_id: ws, params: { limit: 10, sort: "comments" }, actor, persist: false }),
    runSkill({ skill: "comment-themes", workspace_id: ws, params: { sentiment: "negative", limit: 12 }, actor, persist: false }),
    runSkill({ skill: "seeding", workspace_id: ws, params: { limit: 8 }, actor, persist: false }),
  ]);
  const themes = themesNeg.status === "ok" && themesNeg.rows.length ? themesNeg : await runSkill({ skill: "comment-themes", workspace_id: ws, params: { sentiment: "all", limit: 12 }, actor, persist: false });

  // the timeline of events
  const events: PulseEvent[] = [];
  if (root) {
    events.push({ at: root.posted_at, platform: root.platform, what: `${subject} publishes the video`, detail: `${fmt(root.views)} views · ${fmt(root.likes)} likes · ${fmt(root.early_comments)} comments in the first two weeks`, url: root.url, kind: "root" });
  }
  for (const s of spread) {
    if (s.first_post) events.push({ at: s.first_post, platform: s.platform, what: `First ${label(s.platform)} post about ${subject}`, detail: `@${s.first_post_handle}`, url: s.first_post_url ?? undefined, kind: "first" });
    if (s.takeoff) events.push({ at: s.takeoff, platform: s.platform, what: `${label(s.platform)} comments take off`, detail: `first hour with 20 or more comments`, kind: "takeoff" });
    if (s.peak_hour) events.push({ at: s.peak_hour, platform: s.platform, what: `${label(s.platform)} peak`, detail: `${fmt(s.peak_comments)} comments in one hour`, kind: "peak" });
  }
  if (reply) events.push({ at: reply.at, platform: reply.platform, what: `${subject} replies`, detail: `${fmt(reply.likes)} likes · “${reply.text.slice(0, 90)}…”`, kind: "reply" });
  const tops = await db.q<Row>(
    `select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, p.platform, p.creator_handle, p.url, p.views::float8 as views, p.likes, p.comments_count, p.caption
     from posts p where p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub'
     order by coalesce(p.views, 0) + coalesce(p.likes, 0) * 20 desc limit 6`,
    [ws, tz],
  );
  for (const t of tops) events.push({ at: t.at as string, platform: t.platform as string, what: `@${t.creator_handle}: “${String(t.caption ?? "").replace(/\s+/g, " ").slice(0, 70)}”`, detail: `${t.views ? fmt(t.views as number) + " views · " : ""}${fmt(t.likes)} likes · ${fmt(t.comments_count)} comments`, url: t.url as string, kind: "top" });
  events.sort((a, b) => a.at.localeCompare(b.at));

  return {
    subject, productName: cfg.product_name, tz, asOf,
    totals: totals!, root: root ? { url: root.url, posted_at: root.posted_at, caption: root.caption, views: root.views, likes: root.likes, comments: root.comments, early_comments: root.early_comments } : null,
    reply: reply ? { at: reply.at, likes: reply.likes, text: reply.text } : null,
    hourly, posts_hourly, posts_hourly_stance, posts_daily, negative_trend: trimLead(negative_trend), stance, commenters: { ...commenters, first_time: trimLead(commenters.first_time) }, reply_effect, daily, events, spread: spread.map(({ first_post_url: _u, ...s }) => s), sentiment, drivers, themes, seeding,
  };
}

/** Drop the leading hours where a ratio line has nothing to show, so the line starts where the data does. */
function trimLead<T extends { x: string[]; series: { name: string; data: (number | null)[] }[] }>(t: T): T {
  const first = t.series[0].data.findIndex((v) => v != null);
  if (first <= 0) return t;
  return { ...t, x: t.x.slice(first), series: t.series.map((s) => ({ ...s, data: s.data.slice(first) })) };
}

function pivot(rows: Row[], key: string): { x: string[]; series: { name: string; data: number[]; stack?: string }[] } {
  const x = [...new Set(rows.map((r) => r[key] as string))];
  const present = PLATFORMS.filter((p) => rows.some((r) => r.platform === p && (r.n as number) > 0));
  const series = present.map((p) => ({ name: label(p), stack: "s", data: x.map((h) => rows.filter((r) => r[key] === h && r.platform === p).reduce((a, r) => a + (r.n as number), 0)) }));
  return { x, series };
}

function fmt(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("en-US") : "–";
}
