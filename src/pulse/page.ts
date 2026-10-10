/**
 * Pulse: the crisis dashboard for a profile workspace (Refal, 14 Sep 2026). One
 * subject, every platform, comments first. Everything here is computed in SQL
 * or by the comment-layer skills; the page only lays it out.
 */
import { PLATFORM_LABEL } from "../skills/common";
import { toJson } from "../db/json";
import { SkillDb } from "../skills/db";
import { runSkill } from "../skills/runner";
import type { Row, SkillResult } from "../skills/types";
import { getWorkspace } from "../workspace/store";
import { COMMENT_IN_PANEL, panelCommentEdge, panelPostEdge } from "../db/panel";

export const PLATFORMS = ["youtube", "threads", "instagram", "tiktok", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type PulseEvent = { at: string; platform: string; what: string; detail: string; url?: string; kind: "root" | "first" | "reply" | "takeoff" | "peak" | "top" };
/** One hour of the arc: how much arrived, and which way it leaned. Counts are comments about the subject unless named otherwise. */
export type TrendPoint = { h: string; comments: number; off_topic: number; on_topic: number; labelled: number; negative: number; neutral: number; positive: number; posts: number; against: number; for_: number; neutral_posts: number };
export type Trend = { points: TrendPoint[]; peak: TrendPoint | null; peak_posts: TrendPoint | null };
/** A window of the trend, summed. Shares are of on-topic comments, so they answer "how do they feel", not "how much noise". */
export type Span = { comments: number; posts: number; on_topic: number; labelled: number; negative: number; neutral: number; positive: number; negative_pct: number | null; neutral_pct: number | null; positive_pct: number | null; against: number; posts_against_pct: number | null };
export type Status = { now6: Span; prev6: Span; day: Span; prev_day: Span; hours_since_peak: number | null; partial_hour: boolean };
/** A post worth watching: still collecting comments, and hostile. */
export type WatchPost = {
  url: string; platform: string; source: string; handle: string | null; caption: string; posted_at: string;
  comments: number; on_topic: number; negative: number; positive: number; last6h: number; last24h: number;
  negative_pct: number | null; stance: string | null; views: number | null; likes: number | null; latest: string | null;
};
/**
 * What the reputation problem is doing to the money: calls to boycott, and the
 * partner brands named beside the subject. Both are counted only against the
 * words an owner configured, never guessed from the text.
 */
export type BoycottPost = { url: string; platform: string; handle: string | null; caption: string; posted_at: string; views: number | null; likes: number | null; stance: string | null };
export type PartnerRow = { name: string; posts: number; comments: number; posts_24h: number; comments_24h: number; top_views: number | null; first_at: string | null; last_at: string | null };
export type Commercial = {
  configured: boolean;
  posts: number; comments: number;
  posts_24h: number; posts_prev_24h: number; comments_24h: number; comments_prev_24h: number;
  daily: { d: string; posts: number; comments: number; reach: number | null }[];
  top: BoycottPost[];
  partners: PartnerRow[];
};
export type SpreadRow = { platform: string; first_post: string | null; first_post_handle: string | null; first_comment: string | null; takeoff: string | null; peak_hour: string | null; peak_comments: number; posts: number; comments: number; on_topic: number; negative: number; positive: number; labelled: number };
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

/** One side of the conversation (a voice, or a topic): posts by stance, and the comments with their sentiment. */
export type SideRow = { key: string; label: string; posts: number; against: number; neutral: number; for_: number; stanced: number; comments: number; c_negative: number; c_positive: number; c_labelled: number };

export type PulseData = {
  subject: string;
  productName: string;
  tz: string;
  asOf: string;
  postsAsOf: string;
  totals: { posts: number; earned_posts: number; posts_with_comments: number; comments: number; off_topic: number; labelled: number; negative: number; neutral: number; positive: number; accounts: number; platforms: number;
            on_topic: number; on_topic_labelled: number; on_topic_negative: number; on_topic_positive: number;
            owned_comments: number; owned_negative: number; earned_comments: number; earned_negative: number;
            posts_stance_labelled: number; posts_against: number; posts_neutral: number; posts_for: number; posts_no_caption: number };
  root: { url: string; posted_at: string; caption: string; views: number | null; likes: number | null; comments: number; early_comments: number } | null;
  reply: { at: string; likes: number; text: string } | null;
  trend: Trend;
  status: Status;
  watch: WatchPost[];
  commercial: Commercial;
  hourly: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  negative_trend: { x: string[]; series: { name: string; data: (number | null)[] }[] };
  posts_hourly: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  posts_hourly_stance: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  posts_daily: { x: string[]; series: { name: string; data: number[]; stack?: string }[] };
  /** who is talking (the labeller's voices) and about what (the workspace's topics); empty until labelled */
  sides: { voices: SideRow[]; topics: SideRow[] };
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

  // The parts of the page run side by side rather than one query after another: only the arc's
  // charts wait on the arc, the reply's effect on the reply, and the timeline on all of it.
  const headPart = async () => {
    const [subjectRow, totals, asOfRow] = await Promise.all([
      db.one<{ name: string }>("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [ws]),
      // one pass over the comments (with their post's source) and one over the posts, not a scan per number
      db.one<PulseData["totals"]>(
        `with cc as (
           select count(*) filter (where c.sentiment_source is distinct from 'subject')::int as comments,
                  count(*) filter (where c.sentiment is not null)::int as labelled,
                  count(*) filter (where c.sentiment = 'negative')::int as negative,
                  count(*) filter (where c.sentiment = 'neutral')::int as neutral,
                  count(*) filter (where c.sentiment = 'positive')::int as positive,
                  count(distinct (c.platform, c.author_handle)) filter (where c.sentiment_source is distinct from 'subject')::int as accounts,
                  count(distinct c.post_id)::int as posts_with_comments,
                  count(*) filter (where c.off_topic)::int as off_topic,
                  count(*) filter (where c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false))::int as on_topic,
                  count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment is not null)::int as on_topic_labelled,
                  count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative')::int as on_topic_negative,
                  count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'positive')::int as on_topic_positive,
                  count(*) filter (where c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false) and p.source = 'owned')::int as owned_comments,
                  count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative' and p.source = 'owned')::int as owned_negative,
                  count(*) filter (where c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false) and p.source = 'earned')::int as earned_comments,
                  count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative' and p.source = 'earned')::int as earned_negative,
                  array_agg(distinct c.platform) as platforms
           from comments c left join posts p on p.id = c.post_id and p.workspace_id = $1 where c.workspace_id = $1 and coalesce(p.brought_in_by, 'panel') = 'panel'),
         pp as (
           select count(*) filter (where content_type is distinct from 'stub')::int as posts,
                  count(*) filter (where content_type is distinct from 'stub' and source = 'earned')::int as earned_posts,
                  count(*) filter (where content_type is distinct from 'stub' and source = 'earned' and stance is not null)::int as posts_stance_labelled,
                  count(*) filter (where content_type is distinct from 'stub' and source = 'earned' and stance = 'negative')::int as posts_against,
                  count(*) filter (where content_type is distinct from 'stub' and source = 'earned' and stance = 'neutral')::int as posts_neutral,
                  count(*) filter (where content_type is distinct from 'stub' and source = 'earned' and stance = 'positive')::int as posts_for,
                  count(*) filter (where content_type is distinct from 'stub' and source = 'earned' and caption is null)::int as posts_no_caption,
                  array_agg(distinct platform) as platforms
           from posts where workspace_id = $1 and relevant is not false and brought_in_by = 'panel')
         select pp.posts, pp.earned_posts, cc.comments, cc.labelled, cc.negative, cc.neutral, cc.positive, cc.accounts,
                (select count(distinct x) from unnest(coalesce(cc.platforms, '{}') || coalesce(pp.platforms, '{}')) x)::int as platforms,
                cc.posts_with_comments, cc.off_topic, cc.on_topic, cc.on_topic_labelled, cc.on_topic_negative, cc.on_topic_positive,
                cc.owned_comments, cc.owned_negative, cc.earned_comments, cc.earned_negative,
                pp.posts_stance_labelled, pp.posts_against, pp.posts_neutral, pp.posts_for, pp.posts_no_caption
         from cc, pp`,
        [ws],
      ),
      db.one<{ c: string; p: string }>(`select to_char(${panelCommentEdge("$1", "newest")} at time zone $2, 'YYYY-MM-DD HH24:MI') as c, to_char(${panelPostEdge("$1", "newest", "and p.source = 'earned'")} at time zone $2, 'YYYY-MM-DD HH24:MI') as p`, [ws, tz]),
    ]);
    const subject = subjectRow?.name ?? cfg.name;
    const asOf = asOfRow?.c ?? "";
    const postsAsOf = asOfRow?.p ?? "";
    return { subject, totals, asOf, postsAsOf };
  };

  // The arc, hour by hour, from the take-off to the newest data. A fixed 72-hour window
  // hides the start of a crisis once it is three days old, and a fixed long one wastes
  // most of the chart on the quiet weeks before it. So: find the busiest hour, walk back
  // to where the noise floor was, and start there. Capped at five days either way.
  const arcPart = async () => {
    const shape = await db.q<Row>(
      `with last as (select date_trunc('hour', greatest(${panelCommentEdge("$1", "newest")},
                                                        ${panelPostEdge("$1", "newest", "and p.source = 'earned'")}) at time zone $2) as h),
       hrs as (select generate_series((select h from last) - interval '13 days', (select h from last), interval '1 hour') as h),
       -- counted once per hour and joined, not one scan of the workspace per hour
       ch as (select date_trunc('hour', c.posted_at at time zone $2) as h, count(*)::int as n from comments c
              where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.posted_at at time zone $2 >= (select min(h) from hrs) and ${COMMENT_IN_PANEL("c")} group by 1),
       ph as (select date_trunc('hour', p.posted_at at time zone $2) as h, count(*)::int as n from posts p
              where p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel' and p.posted_at at time zone $2 >= (select min(h) from hrs) group by 1)
       select to_char(hrs.h, 'YYYY-MM-DD HH24:00:00') as h, (coalesce(ch.n, 0) + 5 * coalesce(ph.n, 0))::int as n
       from hrs left join ch on ch.h = hrs.h left join ph on ph.h = hrs.h order by 1`,
      [ws, tz],
    );
    const lastH = (shape.at(-1)?.h as string) ?? "";
    const firstH = (shape[Math.max(shape.length - 120, ignition(shape.map((r) => r.n as number)))]?.h as string) ?? (shape[0]?.h as string) ?? "";

    // The root: the post of the subject's that the crowd arrived at first. Ranking her posts
    // by total comments picks whichever one the pile-on later spilled onto, which is a
    // different question — so rank by the comments drawn in the first day of the wave.
    const rootRow = await db.one<Row>(
      `select p.url, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at, p.caption, p.views::float8 as views, p.likes, p.platform,
              (select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')::int as comments,
              (select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject' and c.posted_at < p.posted_at + interval '14 days')::int as early_comments,
              (select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject'
                and c.posted_at at time zone $2 >= $3::timestamp and c.posted_at at time zone $2 < $3::timestamp + interval '24 hours')::int as first_day
       from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.source = 'owned' order by first_day desc, comments desc limit 1`,
      [ws, tz, firstH],
    );
    // A root needs comments to be one: with none loaded (or a deleted original that never
    // reached the export) any owned post would win the ranking, so there is no root.
    const root = rootRow && (rootRow.comments as number) > 0 ? { url: rootRow.url as string, posted_at: rootRow.posted_at as string, caption: String(rootRow.caption ?? "").replace(/\s+/g, " ").slice(0, 220), views: rootRow.views as number | null, likes: rootRow.likes as number | null, comments: rootRow.comments as number, early_comments: rootRow.early_comments as number, platform: rootRow.platform as string } : null;
    // The daily charts start where the wave did, not where the root post was published:
    // a post can sit quiet for weeks before the crowd finds it, and those weeks are a
    // flat line that squashes the days that matter.
    const sinceIso = firstH ? firstH.slice(0, 10) : root ? root.posted_at.slice(0, 10) : null;
    const [trendPart, dailyPart, spread, commercial] = await Promise.all([trendOf(firstH, lastH), dailyOf(sinceIso), spreadOf(sinceIso), commercialOf(sinceIso)]);
    return { root, ...trendPart, ...dailyPart, spread, commercial };
  };
  const trendOf = async (firstH: string, lastH: string) => {
    const hourSeries = `with hrs as (select generate_series($3::timestamp, $4::timestamp, interval '1 hour') as h)`;
    const [trendComments, trendPosts] = await Promise.all([
      db.q<Row>(
        `${hourSeries}
         select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, count(c.id)::int as comments,
                count(c.id) filter (where c.off_topic)::int as off_topic,
                count(c.id) filter (where not coalesce(c.off_topic, false))::int as on_topic,
                count(c.id) filter (where not coalesce(c.off_topic, false) and c.sentiment is not null)::int as labelled,
                count(c.id) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative')::int as negative,
                count(c.id) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'neutral')::int as neutral,
                count(c.id) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'positive')::int as positive
         from hrs left join comments c on c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and ${COMMENT_IN_PANEL("c")}
              and date_trunc('hour', c.posted_at at time zone $2) = hrs.h
         group by 1 order by 1`,
        [ws, tz, firstH, lastH],
      ),
      db.q<Row>(
        `${hourSeries}
         select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, count(p.id)::int as posts,
                count(p.id) filter (where p.stance = 'negative')::int as against,
                count(p.id) filter (where p.stance = 'positive')::int as for_,
                count(p.id) filter (where p.stance = 'neutral')::int as neutral_posts
         from hrs left join posts p on p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel'
              and date_trunc('hour', p.posted_at at time zone $2) = hrs.h
         group by 1 order by 1`,
        [ws, tz, firstH, lastH],
      ),
    ]);
    const postsByHour = new Map(trendPosts.map((r) => [r.h as string, r]));
    const points: TrendPoint[] = trendComments.map((r) => {
      const p = postsByHour.get(r.h as string);
      return {
        h: r.h as string, comments: r.comments as number, off_topic: r.off_topic as number, on_topic: r.on_topic as number,
        labelled: r.labelled as number, negative: r.negative as number, neutral: r.neutral as number, positive: r.positive as number,
        posts: (p?.posts as number) ?? 0, against: (p?.against as number) ?? 0, for_: (p?.for_ as number) ?? 0, neutral_posts: (p?.neutral_posts as number) ?? 0,
      };
    });
    const peak = points.reduce<TrendPoint | null>((a, p) => (a == null || p.comments > a.comments ? p : a), null);
    const peakPosts = points.reduce<TrendPoint | null>((a, p) => (a == null || p.posts > a.posts ? p : a), null);
    const trend: Trend = { points, peak, peak_posts: peakPosts };
    const status: Status = {
      now6: span(points.slice(-6)), prev6: span(points.slice(-12, -6)),
      day: span(points.slice(-24)), prev_day: span(points.slice(-48, -24)),
      hours_since_peak: peak ? points.length - 1 - points.findIndex((p) => p.h === peak.h) : null,
      partial_hour: true,
    };
    return { trend, status };
  };
  const dailyOf = async (sinceIso: string | null) => {
    const days = await db.q<Row>(
      `with bounds as (select coalesce($3::date, ((nc.n at time zone $2) - interval '30 days')::date) as first, (greatest(nc.n, ${panelPostEdge("$1", "newest", "and p.source = 'earned'")}) at time zone $2)::date as last from (select ${panelCommentEdge("$1", "newest")} as n) nc),
       ds as (select generate_series((select first from bounds), (select last from bounds), interval '1 day')::date as d)
       select to_char(ds.d, 'YYYY-MM-DD') as h, c.platform, count(c.id)::int as n
       from ds left join comments c on c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and ${COMMENT_IN_PANEL("c")} and (c.posted_at at time zone $2)::date = ds.d
       group by 1, 2 order by 1`,
      [ws, tz, sinceIso],
    );
    const daily = pivot(days, "h");
    const postDays = await db.q<Row>(
      `with bounds as (select coalesce($3::date, ((nc.n at time zone $2) - interval '30 days')::date) as first, (greatest(nc.n, ${panelPostEdge("$1", "newest", "and p.source = 'earned'")}) at time zone $2)::date as last from (select ${panelCommentEdge("$1", "newest")} as n) nc),
       ds as (select generate_series((select first from bounds), (select last from bounds), interval '1 day')::date as d)
       select to_char(ds.d, 'YYYY-MM-DD') as h, p.platform, count(p.id)::int as n
       from ds left join posts p on p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel' and (p.posted_at at time zone $2)::date = ds.d
       group by 1, 2 order by 1`,
      [ws, tz, sinceIso],
    );
    const posts_daily = pivot(postDays, "h");
    return { daily, posts_daily };
  };
  // spread: per platform, first earned post, first comment, take-off hour (first hour with 20+), peak hour
  const spreadOf = async (sinceIso: string | null) => {
    const spreadRows = await db.q<Row>(
      `with per_hour as (
         select c.platform, date_trunc('hour', c.posted_at at time zone $2) as h, count(*)::int as n
         from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.posted_at >= coalesce($3::date, (now() - interval '60 days')::date) and ${COMMENT_IN_PANEL("c")} group by 1, 2),
       peak as (select distinct on (platform) platform, to_char(h, 'YYYY-MM-DD HH24:00') as peak_hour, n as peak_comments from per_hour order by platform, n desc, h),
       takeoff as (select platform, to_char(min(h), 'YYYY-MM-DD HH24:00') as takeoff from per_hour where n >= 20 group by 1),
       firstpost as (select distinct on (platform) platform, to_char(posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as first_post, creator_handle as first_post_handle, url as first_post_url
                     from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub' and relevant is not false and brought_in_by = 'panel' and posted_at >= now() - interval '60 days' order by platform, posted_at),
       agg as (select c.platform, count(*)::int as comments,
                      count(*) filter (where not coalesce(c.off_topic, false))::int as on_topic,
                      count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative')::int as negative,
                      count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'positive')::int as positive,
                      count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment is not null)::int as labelled,
                      to_char(min(c.posted_at) filter (where c.posted_at >= coalesce($3::date, (now() - interval '60 days')::date)) at time zone $2, 'YYYY-MM-DD HH24:MI') as first_comment
               from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and ${COMMENT_IN_PANEL("c")} group by 1),
       np as (select platform, count(*)::int as posts from posts where workspace_id = $1 and content_type is distinct from 'stub' and relevant is not false and brought_in_by = 'panel' group by 1)
       select a.platform, f.first_post, f.first_post_handle, f.first_post_url, a.first_comment, t.takeoff, pk.peak_hour, coalesce(pk.peak_comments, 0) as peak_comments,
              coalesce(np.posts, 0) as posts, a.comments, a.on_topic, a.negative, a.positive, a.labelled
       from agg a left join firstpost f using (platform) left join takeoff t using (platform) left join peak pk using (platform) left join np using (platform)
       order by a.comments desc`,
      [ws, tz, sinceIso],
    );
    const spread = spreadRows as unknown as (SpreadRow & { first_post_url: string | null })[];
    return spread;
  };
  // Commercial exposure: the point where a reputation problem starts costing money.
  // Only the words the owner configured are counted — a brand Pulse was not told
  // about is not silently matched, and a term list that is empty means the card
  // says so rather than showing a confident zero.
  const commercialOf = (sinceIso: string | null) => commercialExposure(db, ws, tz, cfg.commercial, sinceIso);

  const replyPart = async () => {
    const replyRow = await db.one<Row>(`select to_char(posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, coalesce(likes, 0)::int as likes, text, platform from comments where workspace_id = $1 and ${COMMENT_IN_PANEL("comments")} and sentiment_source = 'subject' order by likes desc nulls last limit 1`, [ws, tz]);
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
           from comments c, (select posted_at as at from comments where workspace_id = $1 and ${COMMENT_IN_PANEL("comments")} and sentiment_source = 'subject' order by likes desc nulls last limit 1) r
           where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.posted_at >= r.at - interval '3 days' and ${COMMENT_IN_PANEL("c")} ${platform ? "and c.platform = $2" : ""}`,
          platform ? [ws, platform] : [ws],
        );
        return { before: { comments: r?.b_comments as number, labelled: r?.b_labelled as number, negative: r?.b_negative as number }, after: { comments: r?.a_comments as number, labelled: r?.a_labelled as number, negative: r?.a_negative as number } };
      };
      const [all, same] = await Promise.all([split(null), split(reply.platform)]);
      reply_effect = { at: reply.at, ...all, same_platform: { platform: reply.platform, ...same } };
    }
    return { reply, reply_effect };
  };

  // The posts still drawing comments: the ones to watch, three deep on every platform.
  const watchPart = async () => {
    const watchRows = await db.q<Row>(
      `with per_post as (
         select p.url, p.platform, p.source, p.creator_handle as handle, p.caption, p.stance, p.views::float8 as views, p.likes,
                to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at,
                count(c.id) filter (where c.sentiment_source is distinct from 'subject')::int as comments,
                count(c.id) filter (where c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false))::int as on_topic,
                count(c.id) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative')::int as negative,
                count(c.id) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'positive')::int as positive,
                count(c.id) filter (where c.sentiment_source is distinct from 'subject' and c.posted_at > ${panelCommentEdge("$1", "newest")} - interval '6 hours')::int as last6h,
                count(c.id) filter (where c.sentiment_source is distinct from 'subject' and c.posted_at > ${panelCommentEdge("$1", "newest")} - interval '24 hours')::int as last24h,
                to_char(max(c.posted_at) at time zone $2, 'YYYY-MM-DD HH24:MI') as latest
         from posts p join comments c on c.post_id = p.id
         where p.workspace_id = $1 and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel'
         group by p.id, p.url, p.platform, p.source, p.creator_handle, p.caption, p.stance, p.views, p.likes, p.posted_at),
       ranked as (select *, row_number() over (partition by platform order by on_topic desc, comments desc) as rn from per_post)
       select * from ranked where rn <= 3 order by on_topic desc, comments desc`,
      [ws, tz],
    );
    const watch: WatchPost[] = watchRows.map((r) => ({
      url: r.url as string, platform: r.platform as string, source: r.source as string, handle: r.handle as string | null,
      caption: String(r.caption ?? "").replace(/\s+/g, " ").slice(0, 160), posted_at: r.posted_at as string,
      comments: r.comments as number, on_topic: r.on_topic as number, negative: r.negative as number, positive: r.positive as number,
      last6h: r.last6h as number, last24h: r.last24h as number,
      negative_pct: (r.on_topic as number) > 0 ? Math.round(((r.negative as number) / (r.on_topic as number)) * 100) : null,
      stance: r.stance as string | null, views: r.views as number | null, likes: r.likes as number | null, latest: r.latest as string | null,
    }));
    return watch;
  };

  // hourly, last 72 h ending at the newest comment; daily since the root post
  const hoursPart = async () => {
    const hours = await db.q<Row>(
      `with bounds as (select date_trunc('hour', greatest(${panelCommentEdge("$1", "newest")}, ${panelPostEdge("$1", "newest", "and p.source = 'earned'")}) at time zone $2) as last),
       hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h)
       select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, c.platform, count(c.id)::int as n
       from hrs left join comments c on c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and ${COMMENT_IN_PANEL("c")} and date_trunc('hour', c.posted_at at time zone $2) = hrs.h
       group by 1, 2 order by 1`,
      [ws, tz],
    );
    const hourly = pivot(hours, "h");
    // posts by other accounts per hour and per day: the density of the conversation, not only its replies
    const postHours = await db.q<Row>(
      `with bounds as (select date_trunc('hour', greatest(${panelCommentEdge("$1", "newest")}, ${panelPostEdge("$1", "newest", "and p.source = 'earned'")}) at time zone $2) as last),
       hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h)
       select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, p.platform, coalesce(p.stance, 'unlabelled') as stance, count(p.id)::int as n
       from hrs left join posts p on p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel' and date_trunc('hour', p.posted_at at time zone $2) = hrs.h
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
    return { hourly, posts_hourly, posts_hourly_stance };
  };

  // negative share per hour on labelled comments; hours with fewer than 10 labelled stay blank
  const negativePart = async () => {
    const negHours = await db.q<Row>(
      `with bounds as (select date_trunc('hour', greatest(${panelCommentEdge("$1", "newest")}, ${panelPostEdge("$1", "newest", "and p.source = 'earned'")}) at time zone $2) as last),
       hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h)
       select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, count(c.id) filter (where c.sentiment is not null)::int as labelled, count(c.id) filter (where c.sentiment = 'negative')::int as negative
       from hrs left join comments c on c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and ${COMMENT_IN_PANEL("c")} and date_trunc('hour', c.posted_at at time zone $2) = hrs.h
       group by 1 order by 1`,
      [ws, tz],
    );
    const negative_trend = { x: negHours.map((r) => r.h as string), series: [{ name: "Negative share of labelled comments (%)", data: negHours.map((r) => ((r.labelled as number) >= 10 ? Math.round(((r.negative as number) / (r.labelled as number)) * 1000) / 10 : null)) }] };
    return negative_trend;
  };

  // stance of the contents about the subject, weighted by reach (views where the platform reports them, likes otherwise)
  const stancePart = async () => {
    const stance = (await db.q<Row>(
      `select platform, count(*)::int as posts,
              count(*) filter (where stance = 'negative')::int as against, count(*) filter (where stance = 'neutral')::int as neutral,
              count(*) filter (where stance = 'positive')::int as for_, count(*) filter (where stance is null)::int as unlabelled,
              coalesce(sum(views), 0)::float8 as views_total, coalesce(sum(views) filter (where stance = 'negative'), 0)::float8 as views_against,
              coalesce(sum(views) filter (where stance = 'positive'), 0)::float8 as views_for, coalesce(sum(views) filter (where stance = 'neutral'), 0)::float8 as views_neutral,
              coalesce(sum(likes), 0)::int as likes_total, coalesce(sum(likes) filter (where stance = 'negative'), 0)::int as likes_against,
              coalesce(sum(likes) filter (where stance = 'positive'), 0)::int as likes_for, coalesce(sum(likes) filter (where stance = 'neutral'), 0)::int as likes_neutral
       from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub' and relevant is not false and brought_in_by = 'panel'
       group by 1 order by posts desc`,
      [ws],
    )) as unknown as StanceRow[];
    return stance;
  };

  // who comments: once vs repeatedly, across posts, across platforms (by handle text), first-time share per hour
  const commentersPart = async () => {
    const cm = await db.one<Row>(
      `with per_account as (
         select c.platform, c.author_handle, count(*)::int as n, count(distinct c.post_id)::int as posts
         from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.author_handle is not null
           and ${COMMENT_IN_PANEL("c")} group by 1, 2),
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
       from comments c where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.author_handle is not null and ${COMMENT_IN_PANEL("c")}
       group by 1, 2 order by comments desc, likes desc limit 8`,
      [ws],
    );
    const firstTime = await db.q<Row>(
      `with bounds as (select date_trunc('hour', greatest(${panelCommentEdge("$1", "newest")}, ${panelPostEdge("$1", "newest", "and p.source = 'earned'")}) at time zone $2) as last),
       hrs as (select generate_series((select last from bounds) - interval '71 hours', (select last from bounds), interval '1 hour') as h),
       firsts as (select platform, author_handle, min(posted_at) as first_at from comments where workspace_id = $1 and ${COMMENT_IN_PANEL("comments")} and sentiment_source is distinct from 'subject' and author_handle is not null group by 1, 2),
       ch as (select date_trunc('hour', c.posted_at at time zone $2) as h, count(*)::int as n from comments c
              where c.workspace_id = $1 and c.sentiment_source is distinct from 'subject' and c.posted_at at time zone $2 >= (select min(h) from hrs) and ${COMMENT_IN_PANEL("c")} group by 1),
       fh as (select date_trunc('hour', f.first_at at time zone $2) as h, count(*)::int as n from firsts f where f.first_at at time zone $2 >= (select min(h) from hrs) group by 1)
       select to_char(hrs.h, 'YYYY-MM-DD HH24:00') as h, coalesce(ch.n, 0)::int as comments, coalesce(fh.n, 0)::int as first_timers
       from hrs left join ch on ch.h = hrs.h left join fh on fh.h = hrs.h order by 1`,
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
    return commenters;
  };

  // Who is talking and about what: the labeller's voice and topic on earned posts and on comments.
  const sidesPart = async () => {
    const sideRows = async (col: "voice" | "topic_id") => {
      const rows = await db.q<Row>(
        `with pp as (
           select coalesce(${col}, '') as k, count(*)::int as posts, count(*) filter (where stance = 'negative')::int as against, count(*) filter (where stance = 'neutral')::int as neutral,
                  count(*) filter (where stance = 'positive')::int as for_, count(stance)::int as stanced
           from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub' and relevant is not false and brought_in_by = 'panel' and stance_source = 'model' group by 1),
         cc as (
           select coalesce(${col}, '') as k, count(*)::int as comments, count(*) filter (where sentiment = 'negative')::int as c_negative, count(*) filter (where sentiment = 'positive')::int as c_positive, count(sentiment)::int as c_labelled
           from comments where workspace_id = $1 and ${COMMENT_IN_PANEL("comments")} and sentiment_source is distinct from 'subject' and not coalesce(off_topic, false) and sentiment is not null group by 1)
         select nullif(coalesce(pp.k, cc.k), '') as k, ${col === "topic_id" ? "t.label, t.is_catch_all, t.sort_order" : "null as label, false as is_catch_all, 0 as sort_order"},
                coalesce(pp.posts, 0) as posts, coalesce(pp.against, 0) as against, coalesce(pp.neutral, 0) as neutral, coalesce(pp.for_, 0) as for_, coalesce(pp.stanced, 0) as stanced,
                coalesce(cc.comments, 0) as comments, coalesce(cc.c_negative, 0) as c_negative, coalesce(cc.c_positive, 0) as c_positive, coalesce(cc.c_labelled, 0) as c_labelled
         from pp full join cc on cc.k = pp.k ${col === "topic_id" ? "left join topics t on t.id = coalesce(pp.k, cc.k)" : ""}
         order by ${col === "topic_id" ? "coalesce(t.is_catch_all, true), " : ""}coalesce(pp.posts, 0) + coalesce(cc.comments, 0) desc`,
        [ws],
      );
      return rows.filter((r) => r.k != null || col === "voice").map((r): SideRow => ({
        key: String(r.k ?? "unclear"), label: col === "voice" ? (r.k == null || r.k === "unclear" ? "Not clear" : String(r.k)) : String(r.label ?? r.k),
        posts: Number(r.posts), against: Number(r.against), neutral: Number(r.neutral), for_: Number(r.for_), stanced: Number(r.stanced),
        comments: Number(r.comments), c_negative: Number(r.c_negative), c_positive: Number(r.c_positive), c_labelled: Number(r.c_labelled),
      }));
    };
    const [voiceRows, topicRows] = await Promise.all([sideRows("voice"), sideRows("topic_id")]);
    // "Not clear" and a voice the labeller never used are folded together; a workspace with no voices labelled shows none
    const voicesFolded = voiceRows.reduce<SideRow[]>((a, r) => {
      const k = r.label === "Not clear" ? "unclear" : r.key;
      const hit = a.find((x) => x.key === k);
      if (!hit) a.push({ ...r, key: k });
      else for (const f of ["posts", "against", "neutral", "for_", "stanced", "comments", "c_negative", "c_positive", "c_labelled"] as const) hit[f] += r[f];
      return a;
    }, []).sort((a, b) => Number(a.key === "unclear") - Number(b.key === "unclear") || b.posts + b.comments - (a.posts + a.comments));
    const sides = { voices: voicesFolded.some((r) => r.key !== "unclear") ? voicesFolded : [], topics: topicRows };
    return sides;
  };

  // the skills, unpersisted
  const skillsPart = async () => {
    const actor = { user_id: "pulse", via: "api" as const };
    const [sentiment, drivers, themesNeg, seeding] = await Promise.all([
      runSkill({ skill: "sentiment", workspace_id: ws, params: { window: { last_n_days: 30 } }, actor, persist: false }),
      runSkill({ skill: "drivers", workspace_id: ws, params: { limit: 10, sort: "comments" }, actor, persist: false }),
      runSkill({ skill: "comment-themes", workspace_id: ws, params: { sentiment: "negative", limit: 12 }, actor, persist: false }),
      runSkill({ skill: "seeding", workspace_id: ws, params: { limit: 8 }, actor, persist: false }),
    ]);
    const themes = themesNeg.status === "ok" && themesNeg.rows.length ? themesNeg : await runSkill({ skill: "comment-themes", workspace_id: ws, params: { sentiment: "all", limit: 12 }, actor, persist: false });
    return { sentiment, drivers, themes, seeding };
  };

  const [{ subject, totals, asOf, postsAsOf }, { root, trend, status, daily, posts_daily, spread, commercial }, { reply, reply_effect }, watch, { hourly, posts_hourly, posts_hourly_stance }, negative_trend, stance, commenters, sides, { sentiment, drivers, themes, seeding }] = await Promise.all([
    headPart(), arcPart(), replyPart(), watchPart(), hoursPart(), negativePart(), stancePart(), commentersPart(), sidesPart(), skillsPart(),
  ]);

  // the timeline of events
  const events: PulseEvent[] = [];
  if (root) {
    events.push({ at: root.posted_at, platform: root.platform, what: `${subject} publishes the post at the centre of this`, detail: `${fmt(root.views)} views · ${fmt(root.likes)} likes · ${fmt(root.early_comments)} comments in the first two weeks`, url: root.url, kind: "root" });
  }
  for (const s of spread) {
    if (s.first_post) events.push({ at: s.first_post, platform: s.platform, what: `First ${label(s.platform)} post about ${subject}`, detail: `@${s.first_post_handle}`, url: s.first_post_url ?? undefined, kind: "first" });
    if (s.takeoff) events.push({ at: s.takeoff, platform: s.platform, what: `${label(s.platform)} comments take off`, detail: `first hour with 20 or more comments`, kind: "takeoff" });
    if (s.peak_hour) events.push({ at: s.peak_hour, platform: s.platform, what: `${label(s.platform)} peak`, detail: `${fmt(s.peak_comments)} comments in one hour`, kind: "peak" });
  }
  // The subject's own posts once the wave is under way (a statement, an apology).
  const firsts = await db.q<Row>(
    `select distinct on (p.platform) p.platform, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, p.creator_handle, p.url
     from posts p where p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel'
     order by p.platform, p.posted_at`,
    [ws, tz],
  );
  // a platform with posts but no comments yet still gets its first post on the timeline
  for (const f of firsts) if (!spread.some((x) => x.platform === f.platform && x.first_post)) events.push({ at: f.at as string, platform: f.platform as string, what: `First ${label(f.platform as string)} post about ${subject}`, detail: `@${f.creator_handle}`, url: f.url as string, kind: "first" });
  const firstEarned = firsts.map((x) => x.at as string).sort()[0];
  if (firstEarned) {
    const own = await db.q<Row>(
      `select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, p.platform, p.creator_handle, p.url, p.likes, p.comments_count, p.caption
       from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.source = 'owned' and p.content_type is distinct from 'stub'
         and p.posted_at at time zone $2 >= $3::timestamp and p.url is distinct from $4
       order by p.posted_at limit 5`,
      [ws, tz, firstEarned, root?.url ?? null],
    );
    for (const o of own) events.push({ at: o.at as string, platform: o.platform as string, what: `${subject} posts on @${o.creator_handle}: “${String(o.caption ?? "").replace(/\s+/g, " ").slice(0, 70)}”`, detail: `${fmt(o.likes)} likes · ${fmt(o.comments_count)} comments`, url: o.url as string, kind: "reply" });
  }
  if (reply) events.push({ at: reply.at, platform: reply.platform, what: `${subject} replies`, detail: `${fmt(reply.likes)} likes · “${reply.text.slice(0, 90)}…”`, kind: "reply" });
  const tops = await db.q<Row>(
    `select to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as at, p.platform, p.creator_handle, p.url, p.views::float8 as views, p.likes, p.comments_count, p.caption
     from posts p where p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel'
     order by coalesce(p.views, 0) + coalesce(p.likes, 0) * 20 desc limit 6`,
    [ws, tz],
  );
  for (const t of tops) events.push({ at: t.at as string, platform: t.platform as string, what: `@${t.creator_handle}: “${String(t.caption ?? "").replace(/\s+/g, " ").slice(0, 70)}”`, detail: `${t.views ? fmt(t.views as number) + " views · " : ""}${fmt(t.likes)} likes · ${fmt(t.comments_count)} comments`, url: t.url as string, kind: "top" });
  events.sort((a, b) => a.at.localeCompare(b.at));

  return {
    subject, productName: cfg.product_name, tz, asOf, postsAsOf,
    totals: totals!, root: root ? { url: root.url, posted_at: root.posted_at, caption: root.caption, views: root.views, likes: root.likes, comments: root.comments, early_comments: root.early_comments } : null,
    reply: reply ? { at: reply.at, likes: reply.likes, text: reply.text } : null,
    trend, status, watch, commercial,
    hourly, posts_hourly, posts_hourly_stance, posts_daily, sides, negative_trend: trimLead(negative_trend), stance, commenters: { ...commenters, first_time: trimLead(commenters.first_time) }, reply_effect, daily, events, spread: spread.map(({ first_post_url: _u, ...s }) => s), sentiment, drivers, themes, seeding,
  };
}

/**
 * Boycott calls and partner brands, from the workspace's own watchlist. Counts are
 * relative to the newest comment rather than the wall clock, so "the last 24 hours"
 * means the last 24 hours of data and does not quietly empty out when a load is late.
 */
async function commercialExposure(db: SkillDb, ws: string, tz: string, cfg: { partners: { name: string; terms: string[] }[]; boycott_terms: string[] }, sinceIso: string | null): Promise<Commercial> {
  const like = (terms: string[]) => terms.map((t) => `%${t}%`);
  const boycott = like(cfg.boycott_terms);
  const configured = cfg.partners.length > 0;
  // each matching post and comment is found once (ilike is the costly part), then counted by window and by day
  const totals = await db.one<Row>(
    `with last as (select greatest(${panelCommentEdge("$1", "newest")}, ${panelPostEdge("$1", "newest")}) as at),
     pm as (select posted_at from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub' and relevant is not false and brought_in_by = 'panel' and caption ilike any($2::text[])),
     cm as (select posted_at from comments where workspace_id = $1 and ${COMMENT_IN_PANEL("comments")} and text ilike any($2::text[]))
     select (select count(*) from pm)::int as posts,
            (select count(*) from cm)::int as comments,
            (select count(*) from pm where posted_at > (select at from last) - interval '24 hours')::int as posts_24h,
            (select count(*) from pm where posted_at between (select at from last) - interval '48 hours' and (select at from last) - interval '24 hours')::int as posts_prev_24h,
            (select count(*) from cm where posted_at > (select at from last) - interval '24 hours')::int as comments_24h,
            (select count(*) from cm where posted_at between (select at from last) - interval '48 hours' and (select at from last) - interval '24 hours')::int as comments_prev_24h`,
    [ws, boycott],
  );
  // per day: grouped once and joined to the days, not three lookups over the workspace for each day
  const daily = await db.q<Row>(
    `with ds as (select generate_series(coalesce($3::date, (now() - interval '6 days')::date), ((${panelCommentEdge("$1", "newest")}) at time zone $2)::date, interval '1 day')::date as d),
     pd as (select (p.posted_at at time zone $2)::date as d,
                   count(*) filter (where p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel')::int as posts, max(p.views) as reach
            from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.source = 'earned' and p.caption ilike any($4::text[]) group by 1),
     cd as (select (c.posted_at at time zone $2)::date as d, count(*)::int as comments
            from comments c where c.workspace_id = $1 and ${COMMENT_IN_PANEL("c")} and c.text ilike any($4::text[]) group by 1)
     select to_char(ds.d, 'YYYY-MM-DD') as d, coalesce(pd.posts, 0)::int as posts, coalesce(cd.comments, 0)::int as comments, pd.reach::float8 as reach
     from ds left join pd on pd.d = ds.d left join cd on cd.d = ds.d order by 1`,
    [ws, tz, sinceIso, boycott],
  );
  const top = await db.q<Row>(
    `select url, platform, creator_handle as handle, caption, to_char(posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at,
            views::float8 as views, likes, stance
     from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub' and relevant is not false and brought_in_by = 'panel' and caption ilike any($3::text[])
     order by coalesce(views, 0) + coalesce(likes, 0) * 20 desc limit 5`,
    [ws, tz, boycott],
  );
  const partners = configured
    ? await db.q<Row>(
        `with last as (select greatest(${panelCommentEdge("$1", "newest")}, ${panelPostEdge("$1", "newest")}) as at),
         pat as (select name, terms from jsonb_to_recordset($2::jsonb) as p(name text, terms text[])),
         per_partner as (
         select pat.name,
                (select count(*) from posts p where p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel' and p.caption ilike any(pat.terms))::int as posts,
                (select count(*) from comments c where c.workspace_id = $1 and ${COMMENT_IN_PANEL("c")} and c.text ilike any(pat.terms))::int as comments,
                (select count(*) from posts p where p.workspace_id = $1 and p.source = 'earned' and p.content_type is distinct from 'stub' and p.relevant is not false and p.brought_in_by = 'panel' and p.caption ilike any(pat.terms) and p.posted_at > (select at from last) - interval '24 hours')::int as posts_24h,
                (select count(*) from comments c where c.workspace_id = $1 and ${COMMENT_IN_PANEL("c")} and c.text ilike any(pat.terms) and c.posted_at > (select at from last) - interval '24 hours')::int as comments_24h,
                (select max(p.views) from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.source = 'earned' and p.caption ilike any(pat.terms))::float8 as top_views,
                to_char((select min(t) from (select min(p.posted_at) t from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.source = 'earned' and p.caption ilike any(pat.terms)
                         union all select ${panelCommentEdge("$1", "oldest", "and c.text ilike any(pat.terms)")}) s) at time zone $3, 'YYYY-MM-DD HH24:MI') as first_at,
                to_char((select max(t) from (select max(p.posted_at) t from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.source = 'earned' and p.caption ilike any(pat.terms)
                         union all select ${panelCommentEdge("$1", "newest", "and c.text ilike any(pat.terms)")}) s) at time zone $3, 'YYYY-MM-DD HH24:MI') as last_at
         from pat)
         select * from per_partner order by comments + posts desc, name`,
        [ws, toJson(cfg.partners.map((p) => ({ name: p.name, terms: like(p.terms) }))), tz],
      )
    : [];
  return {
    configured,
    posts: (totals?.posts as number) ?? 0, comments: (totals?.comments as number) ?? 0,
    posts_24h: (totals?.posts_24h as number) ?? 0, posts_prev_24h: (totals?.posts_prev_24h as number) ?? 0,
    comments_24h: (totals?.comments_24h as number) ?? 0, comments_prev_24h: (totals?.comments_prev_24h as number) ?? 0,
    daily: daily.map((r) => ({ d: r.d as string, posts: r.posts as number, comments: r.comments as number, reach: r.reach as number | null })),
    top: top.map((r) => ({ url: r.url as string, platform: r.platform as string, handle: r.handle as string | null, caption: String(r.caption ?? "").replace(/\s+/g, " ").slice(0, 170), posted_at: r.posted_at as string, views: r.views as number | null, likes: r.likes as number | null, stance: r.stance as string | null })),
    partners: partners as unknown as PartnerRow[],
  };
}

/**
 * Where the current wave started: walk back from the busiest hour to the last stretch of
 * three quiet hours before it. "Quiet" is relative to the peak, so this works for a
 * national pile-on and for a small one. Returns an index into the hourly series.
 */
function ignition(n: number[]): number {
  if (!n.length) return 0;
  const peakAt = n.reduce((a, v, i) => (v > n[a] ? i : a), 0);
  const floor = Math.max(5, n[peakAt] * 0.02);
  let quiet = 0;
  for (let i = peakAt; i >= 0; i--) {
    quiet = n[i] < floor ? quiet + 1 : 0;
    if (quiet >= 3) return Math.max(0, i - 3);
  }
  return 0;
}

/**
 * Sum a run of hours. Shares are taken on the comments about the subject that
 * carry a label — noise in the thread cannot flatter them, and an hour the
 * labeller has not finished reads as incomplete rather than as calm.
 */
function span(points: TrendPoint[]): Span {
  const s = points.reduce(
    (a, p) => ({ comments: a.comments + p.comments, posts: a.posts + p.posts, on_topic: a.on_topic + p.on_topic, labelled: a.labelled + p.labelled, negative: a.negative + p.negative, neutral: a.neutral + p.neutral, positive: a.positive + p.positive, against: a.against + p.against }),
    { comments: 0, posts: 0, on_topic: 0, labelled: 0, negative: 0, neutral: 0, positive: 0, against: 0 },
  );
  const share = (n: number, d: number) => (d >= 10 ? Math.round((n / d) * 1000) / 10 : null);
  return { ...s, negative_pct: share(s.negative, s.labelled), neutral_pct: share(s.neutral, s.labelled), positive_pct: share(s.positive, s.labelled), posts_against_pct: share(s.against, s.posts) };
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
