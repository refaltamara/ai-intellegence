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
export type PulseData = {
  subject: string;
  productName: string;
  tz: string;
  asOf: string;
  totals: { posts: number; earned_posts: number; comments: number; labelled: number; negative: number; neutral: number; positive: number; accounts: number; platforms: number };
  root: { url: string; posted_at: string; caption: string; views: number | null; likes: number | null; comments: number; early_comments: number } | null;
  reply: { at: string; likes: number; text: string } | null;
  hourly: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
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
    hourly, daily, events, spread: spread.map(({ first_post_url: _u, ...s }) => s), sentiment, drivers, themes, seeding,
  };
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
