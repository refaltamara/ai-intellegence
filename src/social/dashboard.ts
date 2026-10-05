/**
 * The Social Media dashboard (DECISIONS, 3 Oct 2026): a brand's own accounts, the view
 * every social team needs. What was posted and how it did against the window before,
 * each account, the formats and times that work, the best and the weakest posts against
 * their own account's usual, posts under-performing right now (from the daily tracking),
 * the competitors' own channels, what the community says under the posts, and data health.
 *
 * Engagement is the main measure: Instagram reports no views on photos and carousels.
 * Views are read only where the platform reports them (video, Threads, X). Every number
 * is computed here in SQL; the page only lays it out.
 */
import { PLATFORM_LABEL } from "../skills/common";
import { SkillDb } from "../skills/db";
import { PR, SOCIAL, type RoleModel } from "../roles/model";
import { dayMonth } from "../competitor/view";
import { settledDay, workspaceBasics, type Basics } from "../reputation/dashboard";

export const SOCIAL_WINDOWS = [7, 30, 90] as const;
export type SocialFilters = { brand: string; days: number; platform: string };

export type Kpi = { now: number | null; prev: number | null };
export type OwnPost = { url: string; platform: string; handle: string | null; format: string; caption: string; posted_at: string; views: number | null; engagements: number; comments: number; index: number | null; neg_pct: number | null };
export type Account = { platform: string; handle: string; posts: number; per_week: number; median_eng: number; median_views: number | null; er: number | null; comments: number; neg_pct: number | null; replies: number };
export type FormatRow = { format: string; posts: number; post_share: number | null; eng_share: number | null; median_eng: number; median_views: number | null };
export type TimingCell = { dow: number; band: string; posts: number; median_eng: number | null };
export type Curve = { day: number; share: number }[];
export type Watch = OwnPost & { day: number; expected: number; why: "under" | "storm" };
export type Competitor = { id: string; name: string; is_focus: boolean; posts: number; per_week: number; median_eng: number; median_views: number | null; comments: number; neg_pct: number | null; top: { url: string; platform: string; engagements: number; caption: string } | null };
export type TopicRow = { topic: string; comments: number; share: number | null; neg_pct: number | null; intent_pct: number | null };
export type Quote = { text: string; translation: string | null; likes: number; platform: string; url: string; sentiment: string | null };
export type Capture = { brand: string; platform: string; handles: string[]; posts: number; first: string; last: string; busiest_day: string | null; busiest: number };

export type SocialData = {
  as_of: string;
  settled: string;
  focus: { id: string; name: string; is_client: boolean };
  brands: { id: string; name: string }[];
  platforms: string[];
  filters: SocialFilters & { from: string; to: string; prev_from: string; prev_to: string };
  /** fewer than five own posts before: the deltas would mislead, so the page shows none */
  comparable: boolean;
  kpis: { posts: Kpi; engagements: Kpi; median_eng: Kpi; video_views: Kpi; comments: Kpi; neg_pct: Kpi; reply_rate: Kpi };
  accounts: Account[];
  formats: FormatRow[];
  timing: TimingCell[];
  best: OwnPost[];
  weakest: OwnPost[];
  curve: Curve;
  watch: Watch[];
  competitors: Competitor[];
  topics: TopicRow[];
  quotes: { positive: Quote[]; negative: Quote[] };
  capture: Capture[];
  notes: string[];
};

const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const share = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const addDays = (d: string, k: number) => new Date(Date.parse(d + "T00:00:00Z") + k * 86400000).toISOString().slice(0, 10);

/** Where views mean something: every platform but Instagram, and Instagram video. */
const VIEWS_OK = `(p.platform <> 'instagram' or p.content_type in ('reel', 'video'))`;
const FORMAT = `case when p.content_type in ('video', 'reel') or p.platform = 'tiktok' then 'Video' when p.content_type in ('photo', 'image') then 'Photo' when p.content_type = 'carousel' then 'Carousel' when p.content_type = 'text' or p.platform in ('x', 'threads') then 'Text' else 'Other' end`;
/** A post captured with no engagement and no views has no metrics yet: counted as published, left out of every median and ranking. */
const MEASURED = `(coalesce(p.engagements, 0) > 0 or coalesce(p.views, 0) > 0)`;
const BANDS = `case when extract(hour from p.posted_at at time zone $2) < 6 then 'Night' when extract(hour from p.posted_at at time zone $2) < 11 then 'Morning' when extract(hour from p.posted_at at time zone $2) < 16 then 'Afternoon' when extract(hour from p.posted_at at time zone $2) < 20 then 'Evening' else 'Late' end`;
export const BAND_ORDER = ["Morning", "Afternoon", "Evening", "Late", "Night"];
export const BAND_HOURS: Record<string, string> = { Morning: "06–11", Afternoon: "11–16", Evening: "16–20", Late: "20–24", Night: "00–06" };

export function readSocialFilters(sp: Record<string, string | string[] | undefined>, brands: string[], client: string | null): SocialFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const days = Number(one("days"));
  const brand = one("brand");
  const platform = one("platform");
  return {
    brand: brand && brands.includes(brand) ? brand : client && brands.includes(client) ? client : brands[0] ?? "",
    days: (SOCIAL_WINDOWS as readonly number[]).includes(days) ? days : 30,
    platform: platform && /^[a-z]{1,12}$/.test(platform) ? platform : "all",
  };
}

/** The dashboard: the window chosen in the URL, ending on the last settled day. */
export async function socialDashboard(ws: string, sp: Record<string, string | string[] | undefined>, role: RoleModel = SOCIAL): Promise<SocialData | null> {
  const db = new SkillDb();
  const basics = await workspaceBasics(db, ws);
  if (!basics) return null;
  const f = readSocialFilters(sp, basics.brands.map((b) => b.id), basics.client);
  const settled = await settledDay(db, ws, basics.tz, basics.asOf, PR.alert!);
  return socialFacts(ws, { focus: f.brand, from: addDays(settled, -(f.days - 1)), to: settled, platform: f.platform }, role, db, basics);
}

/** The facts for one brand's own accounts over any window, against the window before (or the period given). */
export async function socialFacts(ws: string, win: { focus: string; from: string; to: string; platform: string; prev?: { from: string; to: string } }, role: RoleModel = SOCIAL, db: SkillDb = new SkillDb(), basics?: Basics): Promise<SocialData | null> {
  const watchRule = role.watch ?? SOCIAL.watch!;
  const b0 = basics ?? (await workspaceBasics(db, ws));
  if (!b0) return null;
  const { tz, brands, platforms, asOf, client } = b0;
  const settled = await settledDay(db, ws, tz, asOf, PR.alert!);
  const { from, to } = win;
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const prevTo = win.prev?.to ?? addDays(from, -1);
  const prevFrom = win.prev?.from ?? addDays(prevTo, -(len - 1));
  const focus = brands.find((b) => b.id === win.focus) ?? brands.find((b) => b.id === client) ?? brands[0];
  const platform = win.platform !== "all" && platforms.includes(win.platform) ? win.platform : "all";
  const plat = platform === "all" ? null : platform;
  const weeks = Math.max(1, len / 7);

  // $1 workspace, $2 tz, $3 platform (null = all), then per query
  const inDays = (col: string, a: string, b: string) => `${col} >= (${a}::date::timestamp at time zone $2) and ${col} < ((${b}::date + 1)::timestamp at time zone $2)`;
  const platP = plat ? "and p.platform = $3" : "and $3::text is null";
  const own = `posts p where p.workspace_id = $1 and p.source = 'owned' and p.relevant is not false ${platP}`;
  const base = [ws, tz, plat];
  const commentsOf = `(select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')`;

  // ---- headline numbers, now and before
  const kpiRow = (a: string, b: string) =>
    db.one<Record<string, number | null>>(
      `select count(*)::int as posts, count(*) filter (where not ${MEASURED})::int as unmeasured, coalesce(sum(p.engagements), 0)::float8 as engagements,
              (percentile_cont(0.5) within group (order by coalesce(p.engagements, 0)) filter (where ${MEASURED}))::float8 as median_eng,
              (percentile_cont(0.5) within group (order by p.views) filter (where ${VIEWS_OK} and p.views > 0))::float8 as video_views,
              coalesce(sum(${commentsOf}), 0)::int as comments,
              coalesce(sum((select count(*) from comments c where c.post_id = p.id and c.sentiment = 'negative')), 0)::int as negative,
              coalesce(sum((select count(c.sentiment) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')), 0)::int as labelled,
              coalesce(sum((select count(*) from comments c where c.post_id = p.id and c.sentiment_source = 'subject')), 0)::int as replies
       from ${own} and p.brand_id = $4 and ${inDays("p.posted_at", "$5", "$6")}`,
      [...base, focus.id, a, b],
    );
  const [kn, kp] = await Promise.all([kpiRow(from, to), kpiRow(prevFrom, prevTo)]);
  const kpi = (k: string): Kpi => ({ now: nn(kn?.[k]), prev: nn(kp?.[k]) });
  const kpis = {
    posts: kpi("posts"), engagements: kpi("engagements"), median_eng: kpi("median_eng"), video_views: kpi("video_views"), comments: kpi("comments"),
    neg_pct: { now: share(n(kn?.negative), n(kn?.labelled)), prev: share(n(kp?.negative), n(kp?.labelled)) },
    reply_rate: { now: share(n(kn?.replies), n(kn?.comments)), prev: share(n(kp?.replies), n(kp?.comments)) },
  };

  // ---- each own account
  const accRows = await db.q(
    `select p.platform, coalesce(p.creator_handle, '?') as handle, count(*)::int as posts,
            (percentile_cont(0.5) within group (order by coalesce(p.engagements, 0)) filter (where ${MEASURED}))::float8 as median_eng,
            (percentile_cont(0.5) within group (order by p.views) filter (where ${VIEWS_OK} and p.views > 0))::float8 as median_views,
            sum(p.engagements) filter (where ${VIEWS_OK} and p.views > 0)::float8 as eng_rated, sum(p.views) filter (where ${VIEWS_OK} and p.views > 0)::float8 as views_rated,
            coalesce(sum(${commentsOf}), 0)::int as comments,
            coalesce(sum((select count(*) from comments c where c.post_id = p.id and c.sentiment = 'negative')), 0)::int as negative,
            coalesce(sum((select count(c.sentiment) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')), 0)::int as labelled,
            coalesce(sum((select count(*) from comments c where c.post_id = p.id and c.sentiment_source = 'subject')), 0)::int as replies
     from ${own} and p.brand_id = $4 and ${inDays("p.posted_at", "$5", "$6")}
     group by 1, 2 order by posts desc`,
    [...base, focus.id, from, to],
  );
  const accounts: Account[] = accRows.map((r) => ({
    platform: String(r.platform), handle: String(r.handle), posts: n(r.posts), per_week: Math.round((n(r.posts) / weeks) * 10) / 10,
    median_eng: Math.round(n(r.median_eng)), median_views: r.median_views == null ? null : Math.round(Number(r.median_views)),
    er: n(r.views_rated) > 0 ? Math.round((n(r.eng_rated) / n(r.views_rated)) * 10000) / 100 : null,
    comments: n(r.comments), neg_pct: share(n(r.negative), n(r.labelled)), replies: n(r.replies),
  }));

  // ---- formats
  const fmtRows = await db.q(
    `select ${FORMAT} as format, count(*)::int as posts, coalesce(sum(p.engagements), 0)::float8 as eng,
            (percentile_cont(0.5) within group (order by coalesce(p.engagements, 0)) filter (where ${MEASURED}))::float8 as median_eng,
            (percentile_cont(0.5) within group (order by p.views) filter (where ${VIEWS_OK} and p.views > 0))::float8 as median_views
     from ${own} and p.brand_id = $4 and ${inDays("p.posted_at", "$5", "$6")} group by 1 order by 2 desc`,
    [...base, focus.id, from, to],
  );
  const totalPosts = fmtRows.reduce((a, r) => a + n(r.posts), 0);
  const totalEng = fmtRows.reduce((a, r) => a + n(r.eng), 0);
  const formats: FormatRow[] = fmtRows.map((r) => ({ format: String(r.format), posts: n(r.posts), post_share: share(n(r.posts), totalPosts), eng_share: share(n(r.eng), totalEng), median_eng: Math.round(n(r.median_eng)), median_views: r.median_views == null ? null : Math.round(Number(r.median_views)) }));

  // ---- timing: day of week × time of day (WIB), median engagement, cells with 3+ posts
  const timeRows = await db.q(
    `select extract(isodow from p.posted_at at time zone $2)::int as dow, ${BANDS} as band, count(*)::int as posts,
            (percentile_cont(0.5) within group (order by coalesce(p.engagements, 0)) filter (where ${MEASURED}))::float8 as median_eng
     from ${own} and p.brand_id = $4 and ${inDays("p.posted_at", "$5", "$6")} group by 1, 2`,
    [...base, focus.id, from, to],
  );
  const timing: TimingCell[] = timeRows.map((r) => ({ dow: n(r.dow), band: String(r.band), posts: n(r.posts), median_eng: n(r.posts) >= 3 ? Math.round(n(r.median_eng)) : null }));

  // ---- best and weakest against their own account's usual (accounts with enough posts)
  const idxRows = await db.q(
    `with o as (select p.*, ${FORMAT} as format from ${own} and p.brand_id = $4 and ${inDays("p.posted_at", "$5", "$6")} and ${MEASURED}),
          m as (select platform, creator_handle, count(*) as k, percentile_cont(0.5) within group (order by coalesce(engagements, 0)) as med from o group by 1, 2)
     select o.url, o.platform, o.creator_handle as handle, o.format, left(regexp_replace(coalesce(o.caption, ''), '\\s+', ' ', 'g'), 200) as caption,
            to_char(o.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, case when ${VIEWS_OK.replace(/p\./g, "o.")} then o.views::float8 end as views, coalesce(o.engagements, 0)::float8 as engagements,
            (select count(*) from comments c where c.post_id = o.id and c.sentiment_source is distinct from 'subject')::int as comments,
            (select count(*) from comments c where c.post_id = o.id and c.sentiment = 'negative')::int as negative,
            (select count(c.sentiment) from comments c where c.post_id = o.id and c.sentiment_source is distinct from 'subject')::int as labelled,
            case when m.med > 0 then (coalesce(o.engagements, 0) / m.med)::float8 end as idx
     from o join m on m.platform = o.platform and m.creator_handle is not distinct from o.creator_handle
     where m.k >= $7 and m.med > 0`,
    [...base, focus.id, from, to, watchRule.min_account_posts],
  );
  const toPost = (r: Record<string, unknown>): OwnPost => ({
    url: String(r.url), platform: String(r.platform), handle: (r.handle as string) ?? null, format: String(r.format), caption: String(r.caption ?? ""), posted_at: String(r.posted_at),
    views: nn(r.views), engagements: n(r.engagements), comments: n(r.comments), index: r.idx == null ? null : Math.round(Number(r.idx) * 10) / 10,
    neg_pct: n(r.labelled) >= 5 ? share(n(r.negative), n(r.labelled)) : null,
  });
  const indexed = idxRows.map(toPost).filter((p) => p.index != null);
  const best = [...indexed].sort((a, b) => b.index! - a.index! || b.engagements - a.engagements).slice(0, 5);
  const weakest = [...indexed].sort((a, b) => a.index! - b.index! || a.engagements - b.engagements).slice(0, 5);

  // ---- how own posts gain engagement after posting (likes at day n against day 7), every brand's own posts
  const curveRows = await db.q<{ day_n: number; share: number }>(
    `select s.day_n, (percentile_cont(0.5) within group (order by s.likes::float8 / l.likes))::float8 as share
     from post_snapshots s join posts p on p.id = s.post_id
     join lateral (select likes from post_snapshots x where x.post_id = p.id and x.day_n = 7) l on true
     where p.workspace_id = $1 and p.source = 'owned' and l.likes >= 20 and s.day_n between 0 and 7 and s.likes is not null group by 1 order by 1`,
    [ws],
  );
  const curve: Curve = curveRows.map((r) => ({ day: n(r.day_n), share: Math.round(Number(r.share) * 1000) / 1000 }));
  const shareAt = new Map(curve.map((c) => [c.day, c.share]));

  // ---- needs attention: posts of the last week under-performing for their age, and comment storms
  const recent = await db.q(
    `with o as (select p.*, ${FORMAT} as format from ${own} and p.brand_id = $4 and p.posted_at >= (($5::date - 6)::timestamp at time zone $2)),
          m as (select p.platform, p.creator_handle, count(*) as k, percentile_cont(0.5) within group (order by coalesce(p.engagements, 0)) as med
                from ${own} and p.brand_id = $4 and ${MEASURED} and p.posted_at >= (($5::date - 90)::timestamp at time zone $2) group by 1, 2)
     select o.url, o.platform, o.creator_handle as handle, o.format, left(regexp_replace(coalesce(o.caption, ''), '\\s+', ' ', 'g'), 200) as caption,
            to_char(o.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, case when ${VIEWS_OK.replace(/p\./g, "o.")} then o.views::float8 end as views, coalesce(o.engagements, 0)::float8 as engagements,
            ($5::date - (o.posted_at at time zone $2)::date)::int as day, m.med::float8 as med, m.k::int as k,
            (select count(*) from comments c where c.post_id = o.id and c.sentiment_source is distinct from 'subject')::int as comments,
            (select count(*) from comments c where c.post_id = o.id and c.sentiment = 'negative')::int as negative,
            (select count(c.sentiment) from comments c where c.post_id = o.id and c.sentiment_source is distinct from 'subject')::int as labelled
     from o left join m on m.platform = o.platform and m.creator_handle is not distinct from o.creator_handle`,
    [...base, focus.id, asOf],
  );
  const watch: Watch[] = [];
  for (const r of recent) {
    const p = toPost(r);
    const day = Math.min(7, Math.max(0, n(r.day)));
    const expected = n(r.k) >= watchRule.min_account_posts && n(r.med) > 0 ? n(r.med) * (shareAt.get(day) ?? 1) : 0;
    if (n(r.negative) >= watchRule.storm_negative) watch.push({ ...p, day, expected: Math.round(expected), why: "storm" });
    else if (expected > 0 && p.engagements < expected * (watchRule.underperform_pct / 100)) watch.push({ ...p, day, expected: Math.round(expected), why: "under" });
  }
  watch.sort((a, b) => (a.why === b.why ? b.comments - a.comments : a.why === "storm" ? -1 : 1));

  // ---- competitors' own channels
  const compRows = await db.q(
    `select b.id, b.name, count(p.id)::int as posts,
            (percentile_cont(0.5) within group (order by coalesce(p.engagements, 0)) filter (where ${MEASURED}))::float8 as median_eng,
            (percentile_cont(0.5) within group (order by p.views) filter (where ${VIEWS_OK} and p.views > 0))::float8 as median_views,
            coalesce(sum(${commentsOf}), 0)::int as comments,
            coalesce(sum((select count(*) from comments c where c.post_id = p.id and c.sentiment = 'negative')), 0)::int as negative,
            coalesce(sum((select count(c.sentiment) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')), 0)::int as labelled,
            (array_agg(jsonb_build_object('url', p.url, 'platform', p.platform, 'engagements', coalesce(p.engagements, 0), 'caption', left(regexp_replace(coalesce(p.caption, ''), '\\s+', ' ', 'g'), 140)) order by coalesce(p.engagements, 0) desc))[1] as top
     from brands b left join posts p on p.brand_id = b.id and p.workspace_id = $1 and p.source = 'owned' and p.relevant is not false ${platP} and ${inDays("p.posted_at", "$4", "$5")}
     where b.workspace_id = $1 group by b.id, b.name`,
    [...base, from, to],
  );
  const competitors: Competitor[] = compRows.map((r) => ({
    id: String(r.id), name: String(r.name), is_focus: r.id === focus.id, posts: n(r.posts), per_week: Math.round((n(r.posts) / weeks) * 10) / 10,
    median_eng: Math.round(n(r.median_eng)), median_views: r.median_views == null ? null : Math.round(Number(r.median_views)),
    comments: n(r.comments), neg_pct: share(n(r.negative), n(r.labelled)),
    top: n(r.posts) && r.top ? (r.top as Competitor["top"]) : null,
  })).filter((c) => c.posts > 0 || c.is_focus).sort((a, b) => b.posts - a.posts);

  // ---- the community under the posts
  const topicRows = await db.q(
    `select coalesce(t.label, 'No topic') as topic, coalesce(t.is_catch_all, false) as catch_all, count(*)::int as comments,
            count(*) filter (where c.sentiment = 'negative')::int as negative, count(c.sentiment)::int as labelled, count(*) filter (where c.purchase_intent)::int as intent
     from comments c join posts p on p.id = c.post_id left join topics t on t.id = c.topic_id
     where p.workspace_id = $1 and p.source = 'owned' and p.relevant is not false ${platP} and p.brand_id = $4 and ${inDays("p.posted_at", "$5", "$6")}
       and c.sentiment_source is distinct from 'subject'
     group by 1, 2 order by 3 desc`,
    [...base, focus.id, from, to],
  );
  const allComments = topicRows.reduce((a, r) => a + n(r.comments), 0);
  const topics: TopicRow[] = topicRows.map((r) => ({ topic: r.catch_all ? `${r.topic} (no topic fits)` : String(r.topic), comments: n(r.comments), share: share(n(r.comments), allComments), neg_pct: share(n(r.negative), n(r.labelled)), intent_pct: share(n(r.intent), n(r.comments)) }));
  const quoteRows = (sentiment: string) => db.q(
    `select c.text, c.translation, coalesce(c.likes, 0)::int as likes, c.platform, p.url, c.sentiment
     from comments c join posts p on p.id = c.post_id
     where p.workspace_id = $1 and p.source = 'owned' and p.relevant is not false ${platP} and p.brand_id = $4 and ${inDays("p.posted_at", "$5", "$6")}
       and c.sentiment = $7 and c.sentiment_source is distinct from 'subject' and c.text is not null and length(c.text) between 25 and 400
     order by coalesce(c.likes, 0) desc, length(c.text) desc limit 3`,
    [...base, focus.id, from, to, sentiment],
  );
  const toQuote = (r: Record<string, unknown>): Quote => ({ text: String(r.text).replace(/\s+/g, " ").trim(), translation: r.translation ? String(r.translation) : null, likes: n(r.likes), platform: String(r.platform), url: String(r.url), sentiment: (r.sentiment as string) ?? null });
  const [pos, neg] = await Promise.all([quoteRows("positive"), quoteRows("negative")]);

  // ---- data health: own-account capture per brand and platform, and days no account would post
  const capRows = await db.q(
    `with d as (select p.brand_id, p.platform, (p.posted_at at time zone $2)::date as day, count(*)::int as k from posts p where p.workspace_id = $1 and p.source = 'owned' group by 1, 2, 3)
     select p.brand_id, p.platform, array_agg(distinct p.creator_handle) filter (where p.creator_handle is not null) as handles, count(*)::int as posts,
            to_char(min(p.posted_at at time zone $2), 'YYYY-MM-DD') as first, to_char(max(p.posted_at at time zone $2), 'YYYY-MM-DD') as last,
            (select to_char(day, 'YYYY-MM-DD') from d where d.brand_id = p.brand_id and d.platform = p.platform order by k desc limit 1) as busiest_day,
            (select max(k) from d where d.brand_id = p.brand_id and d.platform = p.platform)::int as busiest
     from posts p where p.workspace_id = $1 and p.source = 'owned' group by 1, 2 order by 1, 2`,
    [ws, tz],
  );
  const names = new Map(brands.map((b) => [b.id, b.name]));
  const capture: Capture[] = capRows.map((r) => ({ brand: names.get(String(r.brand_id)) ?? String(r.brand_id), platform: String(r.platform), handles: (r.handles as string[]) ?? [], posts: n(r.posts), first: String(r.first), last: String(r.last), busiest_day: (r.busiest_day as string) ?? null, busiest: n(r.busiest) }));

  const notes: string[] = ["Follower counts are a single capture per account, so audience growth is not shown yet."];
  if (n(kn?.unmeasured)) notes.push(`${n(kn?.unmeasured)} of ${focus.name}'s ${n(kn?.posts)} own posts in these days were captured with no engagement and no views yet; they count as published but are left out of every median and ranking.`);
  if (platform === "all" || platform === "instagram") notes.push("Instagram reports no views on photos and carousels: engagement (likes, comments, shares and saves as each platform counts them) is the measure; views are shown only where the platform reports them.");
  for (const c of capture.filter((c) => c.brand === focus.name && c.busiest >= 20)) notes.push(`${PLATFORM_LABEL[c.platform] ?? c.platform}: ${c.busiest} own-account posts on ${dayMonth(c.busiest_day!)}, more than an account usually publishes in a day; these may be collaboration posts or a capture artefact. Worth checking with the listening team.`);
  for (const c of capture.filter((c) => c.brand === focus.name && c.last < addDays(to, -14))) notes.push(`${PLATFORM_LABEL[c.platform] ?? c.platform}: no own posts captured after ${dayMonth(c.last)}.`);
  if (to < asOf && to === settled) notes.push(`Engagement keeps arriving for a day or two after a post, so this view ends on ${dayMonth(settled)}.`);

  return {
    as_of: asOf, settled, focus: { id: focus.id, name: focus.name, is_client: focus.id === client }, brands, platforms,
    filters: { brand: focus.id, days: len, platform, from, to, prev_from: prevFrom, prev_to: prevTo },
    comparable: n(kp?.posts) >= 5, kpis, accounts, formats, timing, best, weakest, curve, watch: watch.slice(0, 6), competitors, topics, quotes: { positive: pos.map(toQuote), negative: neg.map(toQuote) }, capture, notes,
  };
}
