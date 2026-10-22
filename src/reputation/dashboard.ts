/**
 * The PR dashboard (DECISIONS, 3 Oct 2026): the reputation view a PR team checks every
 * morning, standard for every company. One brand in focus (the client by default),
 * the others as the benchmark. Seven parts: the status ladder, issues building, what
 * is rising, narratives, amplifiers, own channels with the customer-service list,
 * the competitive view, and data health.
 *
 * Every number is computed here in SQL; the page only lays it out. Posts judged not
 * about their brand (posts.relevant = false) and the brands' own replies never count.
 * The alert rule comes from the role model (src/roles/model.ts). By the definitions
 * (src/definitions/catalog.ts): negative share is negative ÷ labelled comments, on topic,
 * without the subject's own replies; reach is Views (latest), the PR role's choice, since a
 * reputation team reads how far something has spread by now (DECISIONS, 10 Oct 2026).
 */
import { PLATFORM_LABEL } from "../skills/common";
import { dayMonth } from "../competitor/view";
import { SkillDb } from "../skills/db";
import { PR, type RoleModel } from "../roles/model";
import { COMMENT_IN_PANEL, panelCommentEdge, panelPlatformsSql, panelPostEdge } from "../db/panel";
import { pulseTrend, type Trend } from "../pulse/page";
import { dailyFacts, readWatch, watchedPosts, type Daily, type Watched } from "./daily";

export type Level = "calm" | "watch" | "issue" | "crisis" | "recovering";
export const WINDOWS = [7, 14, 30] as const;
export type WindowDays = (typeof WINDOWS)[number];

export type PrFilters = { brand: string; days: number; platform: string };
export type DayPoint = { d: string; comments: number; negative: number; neg_pct: number | null; level: Level; /** the day had a norm to be judged against */ norm: boolean };
export type Status = {
  level: Level;
  reason: string;
  day: DayPoint | null;
  baseline: { neg_pct: number | null; comments_per_day: number; days: number };
  multiple: number | null;
  history: DayPoint[];
  rule: string;
};
export type Kpi = { now: number | null; prev: number | null };
export type PostRef = { url: string; platform: string; handle: string | null; source: string; caption: string; posted_at: string; views: number | null; comments: number; negative: number; likes?: number | null; /** the post's own stance, where it is a voice itself */ stance?: string | null };
export type Quote = { text: string; translation: string | null; likes: number; platform: string; url: string; sentiment: string | null; theme: string | null };
/** Posts and comments kept apart: how many, and how many lean each way (a post's stance, a comment's sentiment). */
export type Split = { n: number; negative: number; neutral: number; positive: number; labelled: number };
export type PostsComments = { posts: Split; comments: Split };

export type Issue = {
  /** the same numbers, posts and comments apart (both are voices where posts carry a stance) */
  split: PostsComments;
  topic_id: string | null;
  topic: string;
  catch_all: boolean;
  negative: number;
  negative_prev: number;
  comments: number;
  neg_pct: number | null;
  stage: "building" | "peaking" | "fading" | "steady";
  first_day: string | null;
  peak_day: string | null;
  daily: { d: string; negative: number }[];
  platforms: { platform: string; negative: number }[];
  themes: { theme: string; n: number }[];
  posts: PostRef[];
  quotes: Quote[];
  /** the same topic for the other brands: their negative comments now and before, so the page can say "only us" or "the whole category" */
  industry: { negative: number; negative_prev: number; neg_pct: number | null; brands_up: string[] };
  scope: "only_us" | "category" | "mixed";
};
export type Rising = PostRef & { day: number; projected: number | null; neg_pct: number | null };
export type Narrative = { split: PostsComments; topic_id: string; topic: string; catch_all: boolean; comments: number; comments_prev: number; share: number | null; neg_pct: number | null; neg_pct_prev: number | null; quote: Quote | null };
export type Amplifier = { handle: string; platform: string; tier: string | null; followers: number | null; posts: number; views: number; likes: number; comments: number; neg_pct: number | null; top_url: string; /** their posts that carry a stance, and how many are against */ stanced: number; against: number };
export type OwnRow = { platform: string; posts: number; views: number; comments: number; neg_pct: number | null; replies: number; others_neg_pct: number | null };
export type BrandRow = { id: string; name: string; is_focus: boolean; is_client: boolean; posts: number; posts_prev: number; sov: number | null; views: number; comments: number; neg_pct: number | null; neg_pct_prev: number | null; intent_pct: number | null; top_issue: { topic: string; negative: number; negative_prev: number } | null };
export type Coverage = { platform: string; first: string; last: string; posts: number; off_topic: number; comments: number; reported_comments: number };
/**
 * One platform of a case, on its own (Refal, 14 Oct 2026: the same post on three platforms draws three different
 * crowds). Comments only, each by its own label; the posts by their stance.
 */
export type PlatformSplit = {
  platform: string;
  posts: Split;
  top_post: PostRef | null;
  comments: Split;
  /** comments in the same threads about something else */
  other: number;
  first_comment: string | null;
  /** minutes from the platform's first post to its first comment */
  first_after_min: number | null;
  peak: { at: string; n: number } | null;
  bucket: "hour" | "day";
  series: { at: string; n: number }[];
  topics: { topic: string; catch_all: boolean; n: number; negative: number }[];
  liked: Quote[];
};
/** Accounts commenters tag (@handle): who they pull into the conversation, a rival brand among them. */
export type Tagged = { handle: string; comments: number; platforms: string[]; negative: number; poster: boolean; subject: boolean; example: string; url: string };

export type PrDashboardData = {
  as_of: string;
  /** the last day whose comments have settled; windows end here */
  settled: string;
  tz: string;
  focus: { id: string; name: string; is_client: boolean };
  brands: { id: string; name: string }[];
  platforms: string[];
  filters: PrFilters & { from: string; to: string; prev_from: string; prev_to: string };
  /** of the comments counted, how many are earned posts standing in as voices (a profile's posts carry a stance) */
  voice_posts: number;
  /** the window's posts with a stance and its comments, apart; and by voice where the labeller gives one */
  conversation: { now: PostsComments; prev: PostsComments; by_voice: ({ voice: string } & PostsComments)[] };
  /** each comment counts by its own label, whatever its post (the labeller reads comments against the case; see commentsUnder) */
  per_comment: boolean;
  /** comments in the same threads the labeller found to be about something else: left out, shown beside the count */
  other_comments: { now: number; prev: number };
  status: Status;
  kpis: { mentions: Kpi; reach: Kpi; comments: Kpi; neg_pct: Kpi; intent_pct: Kpi };
  issues: Issue[];
  rising: Rising[];
  narratives: Narrative[];
  amplifiers: Amplifier[];
  own: OwnRow[];
  own_worst: PostRef[];
  /** measured: the workspace's comments carry themes, so service problems can be told apart */
  service: { measured: boolean; total: number; quotes: Quote[] };
  competitive: BrandRow[];
  coverage: Coverage[];
  off_topic_posts: number;
  notes: string[];
  /** around one subject (a case workspace): the conversation platform by platform; absent elsewhere */
  by_platform?: PlatformSplit[];
  /** around one subject: the accounts commenters tag, and how many comments tag anyone */
  tagged?: { comments: number; tagging: number; rows: Tagged[] };
  /** around one subject, on the dashboard only: the Pulse's comments per hour over the wave (src/pulse/page.ts, pulseTrend) */
  pace?: Trend;
  /** around one subject, on the dashboard only: each day of the window up to the newest data (src/reputation/daily.ts) */
  daily?: Daily;
  /** around one subject, on the dashboard only: the posts in settings.pr.watch with their comments */
  watched?: Watched[];
  /** the day tracking began (settings.pr.since), where the workspace says: nothing before it is in the data */
  tracked_since?: string;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const share = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const addDays = (d: string, k: number) => new Date(Date.parse(d + "T00:00:00Z") + k * 86400000).toISOString().slice(0, 10);

/**
 * A negative comment is a service problem when its theme says so (a payment, a refund, an account, the app).
 * Themes, not topics: a workspace's topics mix complaints (promo talk sits under "Transaction Issue" here).
 */
const SERVICE_THEME = /payment|refund|transaction|service failure|customer (support|service)|account|balance|saldo|top ?up|withdraw|funds|app (issue|error|bug)|login|blocked|fraud|card issue|transfer/i;
const NOT_SERVICE = /promo|voucher|discount|cashback|coin|banner|giveaway/i;

/** The crisis bar: the company's own when it set one (always above the issue level), else 1.5× the issue level with the comment floor in negatives. */
/**
 * What is said about a brand: its comments, and the earned posts the labeller gave a stance.
 * Around one subject (a profile), the posts are much of the conversation (a Threads pile-on is
 * replies and quote posts), so each one stands in as its own comment: post_id is itself, its stance
 * is the sentiment, its caption the text. Panels carry no stance on posts, so for them this is
 * their comments alone.
 */
export const VOICES = `(select c.id, c.post_id, c.workspace_id, c.platform, c.posted_at, c.sentiment, c.sentiment_source, c.topic_id, c.likes, c.text, c.translation, c.theme, c.purchase_intent, false as is_post, c.voice, coalesce(c.off_topic, false) as off_topic
     from comments c
   union all
   select p.id, p.id, p.workspace_id, p.platform, p.posted_at, p.stance, 'post', p.topic_id, p.likes, p.caption, null::text, null::text, null::boolean, true, p.voice, false
     from posts p where p.source = 'earned' and p.stance_source = 'model' and p.relevant is not false and p.brought_in_by = 'panel')`;

/**
 * Which comments count, by their post (Refal, 13 Oct 2026: the dashboard and the Pulse gave Kahf two numbers). Where the
 * labeller reads every comment against the case (`settings.label.about`, a case workspace such as Kahf), a comment counts
 * by its own label, whatever its post, as the Pulse counts it. Elsewhere (a listening panel, whose comments carry no topic
 * label) only the comments under posts about the brand count, as before. Either way only the panel's own posts (never a
 * post only a case brought in), so the case rule travels with it.
 */
export const commentsUnder = (perComment: boolean, p = "p") =>
  perComment ? `${p}.brought_in_by = 'panel'` : `${p}.relevant is not false and ${p}.brought_in_by = 'panel'`;

export function crisisOf(alert: NonNullable<RoleModel["alert"]>): { multiple: number; min_negative: number } {
  const m = alert.crisis_multiple != null && alert.crisis_multiple >= alert.negative_multiple * 1.25 ? alert.crisis_multiple : alert.negative_multiple * 1.5;
  return { multiple: Math.round(m * 100) / 100, min_negative: alert.crisis_min_negative ?? alert.min_comments };
}

/** The rule in words, for the status card and the "Why this level?" drawer. */
export function ruleText(alert: NonNullable<RoleModel["alert"]>, who: string): string {
  const c = crisisOf(alert);
  const r = (x: number) => Math.round(x * 100) / 100;
  return `Issue: a day's negative share of comments about ${who} at ${r(alert.negative_multiple)}× its ${alert.baseline_days}-day norm or more, with at least ${alert.min_comments} comments that day. Crisis: ${c.multiple}× or more with ${c.min_negative}+ negative comments. Watch: ${r(1 + (alert.negative_multiple - 1) / 2)}× or more. Recovering: calm again within 7 days of an issue.`;
}

/** The status ladder for one day, from that day's negative share against the baseline. */
export function levelFor(neg: number, comments: number, baselinePct: number | null, alert: NonNullable<RoleModel["alert"]>): { level: Level; multiple: number | null } {
  const pctNow = comments > 0 ? (neg / comments) * 100 : null;
  const multiple = pctNow != null && baselinePct ? Math.round((pctNow / baselinePct) * 10) / 10 : null;
  if (comments < alert.min_comments || multiple == null) return { level: "calm", multiple };
  const crisis = crisisOf(alert);
  if (multiple >= crisis.multiple && neg >= crisis.min_negative) return { level: "crisis", multiple };
  if (multiple >= alert.negative_multiple) return { level: "issue", multiple };
  if (multiple >= 1 + (alert.negative_multiple - 1) / 2) return { level: "watch", multiple };
  return { level: "calm", multiple };
}

/** The ladder over days: a calm day within a week of an issue or a crisis is "recovering". */
export function ladder(days: { d: string; comments: number; negative: number; baseline_pct: number | null }[], alert: NonNullable<RoleModel["alert"]>): DayPoint[] {
  let lastBad = -99;
  return days.map((x, i) => {
    const { level } = levelFor(x.negative, x.comments, x.baseline_pct, alert);
    if (level === "issue" || level === "crisis") lastBad = i;
    const shown: Level = (level === "calm" || level === "watch") && i - lastBad <= 7 && i !== lastBad ? (level === "watch" ? "watch" : "recovering") : level;
    return { d: x.d, comments: x.comments, negative: x.negative, neg_pct: share(x.negative, x.comments), level: shown, norm: x.baseline_pct != null };
  });
}

/**
 * The last day whose comments have settled: comments keep arriving for a day or two after a post,
 * so the newest days of any capture are thin. A day counts once it carries at least half the usual
 * daily comments (median of the 28 days before it) and the alert's minimum.
 */
export async function settledDay(db: SkillDb, ws: string, tz: string, asOf: string, alert: NonNullable<RoleModel["alert"]>): Promise<string> {
  const rows = await db.q<{ d: string; n: number }>(
    `with days as (select generate_series($3::date - 35, $3::date, interval '1 day')::date as d)
     select to_char(days.d, 'YYYY-MM-DD') as d, (select count(*) from ${VOICES} c where c.workspace_id = $1 and ${COMMENT_IN_PANEL("c")} and c.posted_at >= (days.d::timestamp at time zone $2) and c.posted_at < ((days.d + 1)::timestamp at time zone $2))::int as n
     from days order by 1`,
    [ws, tz, asOf],
  );
  const counts = rows.map((r) => n(r.n));
  for (let i = rows.length - 1; i >= 7; i--) {
    const prior = counts.slice(Math.max(0, i - 28), i).sort((a, b) => a - b);
    const median = prior[Math.floor(prior.length / 2)] ?? 0;
    if (counts[i] >= Math.max(alert.min_comments, median / 2)) return rows[i].d;
  }
  return asOf;
}

export function readPrFilters(sp: Record<string, string | string[] | undefined>, brands: string[], client: string | null): PrFilters & { days: WindowDays } {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const days = Number(one("days"));
  const brand = one("brand");
  const platform = one("platform");
  return {
    brand: brand && brands.includes(brand) ? brand : client && brands.includes(client) ? client : brands[0] ?? "",
    days: (WINDOWS as readonly number[]).includes(days) ? (days as WindowDays) : 7,
    platform: platform && /^[a-z]{1,12}$/.test(platform) ? platform : "all",
  };
}

export type Basics = { tz: string; client: string | null; brands: { id: string; name: string }[]; platforms: string[]; asOf: string; per_comment: boolean };

export async function workspaceBasics(db: SkillDb, ws: string): Promise<Basics | null> {
  const w = await db.one<{ tz: string; client: string | null; per_comment: boolean }>("select tz, client_brand_id as client, (settings->'label'->>'about') is not null as per_comment from workspaces where id = $1", [ws]);
  if (!w) return null;
  const brands = await db.q<{ id: string; name: string }>("select id, name from brands where workspace_id = $1 order by name", [ws]);
  if (!brands.length) return null;
  const platforms = (await db.q<{ platform: string }>(panelPlatformsSql("$1"), [ws])).map((r) => r.platform);
  const asOfRow = await db.one<{ d: string }>(
    `select to_char(greatest(${panelCommentEdge("$1", "newest")}, ${panelPostEdge("$1", "newest")}) at time zone $2, 'YYYY-MM-DD') as d`,
    [ws, w.tz],
  );
  return { tz: w.tz, client: w.client, brands, platforms, asOf: asOfRow?.d ?? new Date().toISOString().slice(0, 10), per_comment: !!w.per_comment };
}

/** The dashboard: the window chosen in the URL, ending on the last settled day. */
export async function prDashboard(ws: string, sp: Record<string, string | string[] | undefined>, role: RoleModel = PR): Promise<PrDashboardData | null> {
  const db = new SkillDb();
  const basics = await workspaceBasics(db, ws);
  if (!basics) return null;
  const f = readPrFilters(sp, basics.brands.map((b) => b.id), basics.client);
  const settled = await settledDay(db, ws, basics.tz, basics.asOf, role.alert ?? PR.alert!);
  // the workspace's own pr settings: the posts to watch and the day tracking began (Refal, 22 Oct 2026)
  const prSet = basics.per_comment ? (await db.one<{ pr: { watch?: unknown; since?: unknown } | null }>("select settings->'pr' as pr from workspaces where id = $1", [ws]))?.pr ?? null : null;
  const since = typeof prSet?.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(prSet.since) ? prSet.since : undefined;
  // a window never starts before tracking began: the days before it hold nothing
  const from0 = addDays(settled, -(f.days - 1));
  const from = since && from0 < since && since <= settled ? since : from0;
  // around one subject the dashboard also draws the Pulse's comments per hour, the days up to the newest data and the
  // posts to watch (decks do not, so they are read here, not in reputationFacts)
  const one = basics.per_comment;
  const plat = f.platform !== "all" && basics.platforms.includes(f.platform) ? f.platform : null;
  const focus = basics.brands.find((b) => b.id === f.brand)?.id ?? basics.client ?? basics.brands[0].id;
  const watch = one ? readWatch(prSet?.watch) : [];
  const [d, pace, daily, watched] = await Promise.all([
    reputationFacts(ws, { focus: f.brand, from, to: settled, platform: f.platform, ...(since ? { since } : {}) }, role, db, basics),
    one ? pulseTrend(ws, f.platform).catch(() => null) : Promise.resolve(null),
    one ? dailyFacts(db, ws, basics.tz, focus, from, basics.asOf > settled ? basics.asOf : settled, settled, plat, commentsUnder(true)).catch(() => null) : Promise.resolve(null),
    watch.length ? watchedPosts(db, ws, basics.tz, watch).catch(() => []) : Promise.resolve([]),
  ]);
  if (!d) return d;
  return { ...d, ...(pace ? { pace } : {}), ...(daily ? { daily } : {}), ...(watched.length ? { watched } : {}) };
}

/**
 * The reputation facts for one brand over any window (the dashboard's rolling days, a deck's week or month),
 * against the same number of days before it. The status is read on the window's last day, or on the last
 * settled day when the window runs past it.
 */
export async function reputationFacts(ws: string, win: { focus: string; from: string; to: string; platform: string; prev?: { from: string; to: string }; /** the day tracking began (settings.pr.since): one note for it, none per platform */ since?: string }, role: RoleModel = PR, db: SkillDb = new SkillDb(), basics?: Basics): Promise<PrDashboardData | null> {
  const alert = role.alert ?? PR.alert!;
  const b0 = basics ?? (await workspaceBasics(db, ws));
  if (!b0) return null;
  const { tz, brands, platforms, asOf, client, per_comment } = b0;
  const under = commentsUnder(per_comment);
  const settled = await settledDay(db, ws, tz, asOf, alert);
  const from = win.from;
  const to = win.to;
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const prevTo = win.prev?.to ?? addDays(from, -1);
  const prevFrom = win.prev?.from ?? addDays(prevTo, -(len - 1));
  const focus = brands.find((b) => b.id === win.focus) ?? brands.find((b) => b.id === client) ?? brands[0];
  const f: PrFilters = { brand: focus.id, days: len, platform: win.platform !== "all" && platforms.includes(win.platform) ? win.platform : "all" };
  const plat = f.platform === "all" ? null : f.platform;
  const statusDay = to < settled ? to : settled;

  // Shared fragments. $1 workspace, $2 tz, then per query.
  const inDays = (col: string, a: string, b: string) => `${col} >= (${a}::date::timestamp at time zone $2) and ${col} < ((${b}::date + 1)::timestamp at time zone $2)`;
  const platC = plat ? "and c.platform = $3" : "and $3::text is null";
  const platP = plat ? "and p.platform = $3" : "and $3::text is null";
  const onBrandComments = `${VOICES} c join posts p on p.id = c.post_id
     where c.workspace_id = $1 and ${under} and c.sentiment_source is distinct from 'subject' and not c.off_topic and c.posted_at is not null ${platC}`;
  const base = [ws, tz, plat];

  // ---- status ladder: the focus brand's daily negative share against the 28 days before each day (all platforms)
  const span = alert.baseline_days + 30;
  const daily = await db.q<{ d: string; comments: number; negative: number }>(
    `with days as (select generate_series($4::date - ($5::int - 1), $4::date, interval '1 day')::date as d)
     select to_char(days.d, 'YYYY-MM-DD') as d, count(c.id)::int as comments, count(c.id) filter (where c.sentiment = 'negative')::int as negative
     from days left join (select c.id, c.sentiment, (c.posted_at at time zone $2)::date as day from ${onBrandComments.replace(platC, "and $3::text is null")} and p.brand_id = $6) c on c.day = days.d
     group by days.d order by days.d`,
    [ws, tz, null, statusDay, span, focus.id],
  );
  const withBase = daily.map((x, i) => {
    const prior = daily.slice(Math.max(0, i - alert.baseline_days), i);
    const pc = prior.reduce((a, r) => a + n(r.comments), 0);
    const pn = prior.reduce((a, r) => a + n(r.negative), 0);
    // a norm needs seven days that carried talk: a capture that starts with the crisis has none, and judging it against itself reads calm
    return { d: x.d, comments: n(x.comments), negative: n(x.negative), baseline_pct: prior.filter((r) => n(r.comments) > 0).length >= 7 && pc >= alert.min_comments ? (pn / pc) * 100 : null };
  });
  const hist = ladder(withBase.filter((x) => x.d <= statusDay), alert).slice(-30);
  const today = hist.at(-1) ?? null;
  const lastBase = withBase.find((x) => x.d === statusDay);
  const settledAt = daily.findIndex((x) => x.d === statusDay);
  const priorDays = daily.slice(Math.max(0, settledAt - alert.baseline_days), Math.max(0, settledAt));
  const baseComments = priorDays.reduce((a, r) => a + n(r.comments), 0);
  const { multiple } = today ? levelFor(today.negative, today.comments, lastBase?.baseline_pct ?? null, alert) : { multiple: null };
  const status: Status = {
    level: today?.level ?? "calm",
    reason: "",
    day: today,
    baseline: { neg_pct: lastBase?.baseline_pct == null ? null : Math.round(lastBase.baseline_pct * 10) / 10, comments_per_day: priorDays.length ? Math.round(baseComments / priorDays.length) : 0, days: priorDays.length },
    multiple,
    history: hist,
    rule: ruleText(alert, focus.name),
  };

  // ---- headline numbers, now and before
  const kpiRow = async (a: string, b: string) =>
    db.one<{ mentions: number; reach: number | null; comments: number; negative: number; labelled: number; intent: number; intent_read: number; post_voices: number }>(
      `select (select count(*) from posts p where p.workspace_id = $1 and p.brand_id = $4 and p.relevant is not false and p.brought_in_by = 'panel' ${platP} and ${inDays("p.posted_at", "$5", "$6")})::int as mentions,
              (select sum(p.views) from posts p where p.workspace_id = $1 and p.brand_id = $4 and p.relevant is not false and p.brought_in_by = 'panel' ${platP} and ${inDays("p.posted_at", "$5", "$6")})::float8 as reach,
              count(c.id)::int as comments, count(c.id) filter (where c.sentiment = 'negative')::int as negative, count(c.sentiment)::int as labelled,
              count(c.id) filter (where c.purchase_intent)::int as intent, count(c.purchase_intent)::int as intent_read, count(c.id) filter (where c.is_post)::int as post_voices
       from ${onBrandComments} and p.brand_id = $4 and ${inDays("c.posted_at", "$5", "$6")}`,
      [...base, focus.id, a, b],
    );
  const otherRow = db.one<{ now: number; prev: number }>(
    `select count(*) filter (where ${inDays("c.posted_at", "$5", "$6")})::int as now, count(*) filter (where ${inDays("c.posted_at", "$7", "$8")})::int as prev
       from comments c join posts p on p.id = c.post_id
      where c.workspace_id = $1 and ${under} and p.brand_id = $4 and c.sentiment_source is distinct from 'subject' and c.off_topic ${platC}
        and ${inDays("c.posted_at", "$7", "$6")}`,
    [...base, focus.id, from, to, prevFrom, prevTo],
  );
  const [kn, kp, other] = await Promise.all([kpiRow(from, to), kpiRow(prevFrom, prevTo), otherRow]);
  // the conversation, posts and comments apart, now and before, and by the labeller's voice
  const convRows = await db.q<{ win: string; is_post: boolean; voice: string | null; n: number; negative: number; neutral: number; positive: number; labelled: number }>(
    `select case when ${inDays("c.posted_at", "$5", "$6")} then 'now' else 'prev' end as win, c.is_post, c.voice,
            count(*)::int as n, count(*) filter (where c.sentiment = 'negative')::int as negative, count(*) filter (where c.sentiment = 'neutral')::int as neutral,
            count(*) filter (where c.sentiment = 'positive')::int as positive, count(c.sentiment)::int as labelled
     from ${onBrandComments} and p.brand_id = $4 and ${inDays("c.posted_at", "$7", "$6")}
     group by 1, 2, 3`,
    [...base, focus.id, from, to, prevFrom],
  );
  const convOf = (rows: typeof convRows): PostsComments => {
    const one = (post: boolean): Split => rows.filter((r) => !!r.is_post === post).reduce((a, r) => ({ n: a.n + n(r.n), negative: a.negative + n(r.negative), neutral: a.neutral + n(r.neutral), positive: a.positive + n(r.positive), labelled: a.labelled + n(r.labelled) }), { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 });
    return { posts: one(true), comments: one(false) };
  };
  const nowConv = convRows.filter((r) => r.win === "now");
  const voices = [...new Set(nowConv.map((r) => r.voice ?? "unclear"))];
  const conversation = {
    now: convOf(nowConv), prev: convOf(convRows.filter((r) => r.win === "prev")),
    // only where the labeller reads a voice (a case workspace); "unclear" last
    by_voice: nowConv.some((r) => r.voice != null && r.voice !== "unclear")
      ? voices.map((v) => ({ voice: v, ...convOf(nowConv.filter((r) => (r.voice ?? "unclear") === v)) }))
        .sort((a, b) => Number(a.voice === "unclear") - Number(b.voice === "unclear") || b.posts.n + b.comments.n - (a.posts.n + a.comments.n))
      : [],
  };
  const kpis = {
    mentions: { now: n(kn?.mentions), prev: n(kp?.mentions) },
    // Threads and some exports report no views: reach is unknown there, not zero
    reach: { now: kn?.reach == null ? null : n(kn.reach), prev: kp?.reach == null ? null : n(kp.reach) },
    comments: { now: n(kn?.comments), prev: n(kp?.comments) },
    neg_pct: { now: share(n(kn?.negative), n(kn?.labelled)), prev: share(n(kp?.negative), n(kp?.labelled)) },
    intent_pct: { now: n(kn?.intent_read) ? share(n(kn?.intent), n(kn?.comments)) : null, prev: n(kp?.intent_read) ? share(n(kp?.intent), n(kp?.comments)) : null },
  };

  // ---- topics for everyone in both windows (narratives, issues, the industry check)
  const topicRows = await db.q<{ topic_id: string | null; label: string | null; catch_all: boolean | null; brand_id: string; win: string; is_post: boolean; comments: number; negative: number; neutral: number; positive: number; labelled: number }>(
    `select c.topic_id, t.label, t.is_catch_all as catch_all, p.brand_id,
            case when ${inDays("c.posted_at", "$4", "$5")} then 'now' else 'prev' end as win, c.is_post,
            count(*)::int as comments, count(*) filter (where c.sentiment = 'negative')::int as negative, count(*) filter (where c.sentiment = 'neutral')::int as neutral,
            count(*) filter (where c.sentiment = 'positive')::int as positive, count(c.sentiment)::int as labelled
     from ${VOICES} c join posts p on p.id = c.post_id left join topics t on t.id = c.topic_id
     where c.workspace_id = $1 and ${under} and c.sentiment_source is distinct from 'subject' and not c.off_topic and c.posted_at is not null ${platC}
       and ${inDays("c.posted_at", "$6", "$5")}
     group by 1, 2, 3, 4, 5, 6`,
    [...base, from, to, prevFrom],
  );
  const tKey = (r: { topic_id: string | null }) => r.topic_id ?? "";
  const splitOf = (rows: typeof topicRows): PostsComments => {
    const one = (post: boolean): Split => rows.filter((r) => !!r.is_post === post).reduce((a, r) => ({ n: a.n + n(r.comments), negative: a.negative + n(r.negative), neutral: a.neutral + n(r.neutral), positive: a.positive + n(r.positive), labelled: a.labelled + n(r.labelled) }), { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 });
    return { posts: one(true), comments: one(false) };
  };
  const topics = new Map<string, { label: string; catch_all: boolean }>();
  for (const r of topicRows) if (r.topic_id) topics.set(r.topic_id, { label: r.label ?? r.topic_id, catch_all: !!r.catch_all });
  const sum = (pred: (r: (typeof topicRows)[number]) => boolean, k: "comments" | "negative" | "labelled") => topicRows.filter(pred).reduce((a, r) => a + n(r[k]), 0);
  const focusNowTotal = sum((r) => r.brand_id === focus.id && r.win === "now", "comments");

  const quoteSql = (extra: string) => `
     select c.text, c.translation, coalesce(c.likes, 0)::int as likes, c.platform, p.url, c.sentiment, c.theme
     from ${onBrandComments} and p.brand_id = $4 and ${inDays("c.posted_at", "$5", "$6")} and c.text is not null and length(c.text) between 25 and 400 ${extra}
     order by coalesce(c.likes, 0) desc, length(c.text) desc limit $7`;
  const toQuote = (r: Record<string, unknown>): Quote => ({ text: String(r.text).replace(/\s+/g, " ").trim(), translation: r.translation ? String(r.translation) : null, likes: n(r.likes), platform: String(r.platform), url: String(r.url), sentiment: (r.sentiment as string) ?? null, theme: (r.theme as string) ?? null });

  const narratives: Narrative[] = [];
  for (const [id, t] of topics) {
    const now = topicRows.filter((r) => r.brand_id === focus.id && r.win === "now" && tKey(r) === id);
    const prev = topicRows.filter((r) => r.brand_id === focus.id && r.win === "prev" && tKey(r) === id);
    const c = now.reduce((a, r) => a + n(r.comments), 0);
    if (!c && !prev.length) continue;
    const lab = now.reduce((a, r) => a + n(r.labelled), 0);
    narratives.push({
      split: splitOf(now),
      topic_id: id, topic: t.label, catch_all: t.catch_all, comments: c, comments_prev: prev.reduce((a, r) => a + n(r.comments), 0), share: share(c, focusNowTotal),
      neg_pct: share(now.reduce((a, r) => a + n(r.negative), 0), lab), neg_pct_prev: share(prev.reduce((a, r) => a + n(r.negative), 0), prev.reduce((a, r) => a + n(r.labelled), 0)),
      quote: null,
    });
  }
  narratives.sort((a, b) => Number(a.catch_all) - Number(b.catch_all) || b.comments - a.comments);
  await Promise.all(narratives.slice(0, 8).map(async (x) => {
    const r = await db.q(quoteSql("and c.topic_id = $8"), [...base, focus.id, from, to, 1, x.topic_id]);
    x.quote = r[0] ? toQuote(r[0]) : null;
  }));

  // ---- issues: the focus brand's topics carrying negative comments now, biggest first
  const minIssue = Math.max(10, Math.round(alert.min_comments / 5));
  const issueTopics = [...topics.entries()]
    .map(([id, t]) => ({ id, t, neg: sum((r) => r.brand_id === focus.id && r.win === "now" && tKey(r) === id, "negative") }))
    .filter((x) => x.neg >= minIssue)
    // named topics first; the catch-all last, under its own name, because a story nobody has a topic for is still a story
    .sort((a, b) => Number(a.t.catch_all) - Number(b.t.catch_all) || b.neg - a.neg)
    .slice(0, 4);
  const issues: Issue[] = await Promise.all(issueTopics.map(async ({ id, t, neg }) => {
    const mine = (win: string, k: "comments" | "negative" | "labelled") => sum((r) => r.brand_id === focus.id && r.win === win && tKey(r) === id, k);
    const others = (win: string, k: "comments" | "negative" | "labelled") => sum((r) => r.brand_id !== focus.id && r.win === win && tKey(r) === id, k);
    // other brands hit by the same topic: their negative share on it at least ours, on enough comments
    const ourPct = share(neg, mine("now", "labelled"));
    const upBrands = brands.filter((b) => b.id !== focus.id).filter((b) => {
      const bn = sum((r) => r.brand_id === b.id && r.win === "now" && tKey(r) === id, "negative");
      const bl = sum((r) => r.brand_id === b.id && r.win === "now" && tKey(r) === id, "labelled");
      return bn >= minIssue && ourPct != null && (bn / Math.max(1, bl)) * 100 >= ourPct;
    }).map((b) => b.name);
    const [dailyRows, platRows, themeRows, postRows, quoteRows] = await Promise.all([
      db.q<{ d: string; negative: number }>(
        `with days as (select generate_series($5::date, $6::date, interval '1 day')::date as d)
         select to_char(days.d, 'YYYY-MM-DD') as d, count(c.id)::int as negative
         from days left join (select c.id, (c.posted_at at time zone $2)::date as day from ${onBrandComments} and p.brand_id = $4 and c.topic_id = $7 and c.sentiment = 'negative') c on c.day = days.d
         group by days.d order by days.d`, [...base, focus.id, from, to, id]),
      db.q<{ platform: string; negative: number }>(`select c.platform, count(*)::int as negative from ${onBrandComments} and p.brand_id = $4 and c.topic_id = $7 and c.sentiment = 'negative' and ${inDays("c.posted_at", "$5", "$6")} group by 1 order by 2 desc`, [...base, focus.id, from, to, id]),
      db.q<{ theme: string; n: number }>(`select c.theme, count(*)::int as n from ${onBrandComments} and p.brand_id = $4 and c.topic_id = $7 and c.sentiment = 'negative' and c.theme is not null and c.theme <> 'unknown' and ${inDays("c.posted_at", "$5", "$6")} group by 1 order by 2 desc limit 5`, [...base, focus.id, from, to, id]),
      db.q(`select p.url, p.platform, p.creator_handle as handle, p.source, left(regexp_replace(coalesce(p.caption, ''), '\\s+', ' ', 'g'), 200) as caption, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, p.views::float8 as views, p.likes,
                   count(*) filter (where not c.is_post)::int as comments, count(*) filter (where c.sentiment = 'negative' and not c.is_post)::int as negative,
                   max(c.sentiment) filter (where c.is_post) as stance, count(*) filter (where c.sentiment = 'negative')::int as weight
            from ${onBrandComments} and p.brand_id = $4 and c.topic_id = $7 and ${inDays("c.posted_at", "$5", "$6")}
            group by p.id order by weight desc, comments desc, p.likes desc nulls last limit 3`, [...base, focus.id, from, to, id]),
      db.q(quoteSql("and c.topic_id = $8 and c.sentiment = 'negative'"), [...base, focus.id, from, to, 3, id]),
    ]);
    const series = dailyRows.map((r) => ({ d: r.d, negative: n(r.negative) }));
    // the stage is read on the days the data has reached: a deck's week can run past today, and empty days to come are not a fade
    const seen = series.filter((r) => r.d <= statusDay);
    const peak = seen.reduce<{ d: string; negative: number } | null>((a, r) => (!a || r.negative > a.negative ? r : a), null);
    const firstDay = seen.find((r) => r.negative > 0)?.d ?? null;
    const last3 = seen.slice(-3).reduce((a, r) => a + r.negative, 0);
    const prev3 = seen.slice(-6, -3).reduce((a, r) => a + r.negative, 0);
    const stage: Issue["stage"] = peak && seen.slice(-2).some((r) => r.d === peak.d) ? "peaking" : last3 > prev3 * 1.25 ? "building" : last3 < prev3 * 0.75 ? "fading" : "steady";
    const indNow = others("now", "negative"), indPrev = others("prev", "negative");
    const mineNow = neg, minePrev = mine("prev", "negative");
    // Is it us or the category? Compare shares, never counts: collection grows for every brand at once.
    const theirPct = share(indNow, others("now", "labelled"));
    const theirPrevPct = share(indPrev, others("prev", "labelled"));
    const scope: Issue["scope"] =
      ourPct != null && theirPct != null && ourPct >= theirPct * 1.5 ? "only_us"
      : theirPct != null && ourPct != null && (theirPct >= ourPct || (theirPrevPct != null && theirPct >= theirPrevPct * 1.25)) ? "category"
      : "mixed";
    return {
      split: splitOf(topicRows.filter((r) => r.brand_id === focus.id && r.win === "now" && tKey(r) === id)),
      topic_id: id, topic: t.catch_all ? "Not in a topic" : t.label, catch_all: t.catch_all, negative: mineNow, negative_prev: minePrev, comments: mine("now", "comments"), neg_pct: share(mineNow, mine("now", "labelled")),
      stage, first_day: firstDay, peak_day: peak?.negative ? peak.d : null, daily: series,
      platforms: platRows.map((r) => ({ platform: r.platform, negative: n(r.negative) })),
      themes: themeRows.map((r) => ({ theme: r.theme, n: n(r.n) })),
      posts: postRows.map((r) => ({ url: String(r.url), platform: String(r.platform), handle: (r.handle as string) ?? null, source: String(r.source), caption: String(r.caption ?? ""), posted_at: String(r.posted_at), views: nn(r.views), comments: n(r.comments), negative: n(r.negative), likes: nn(r.likes), stance: (r.stance as string) ?? null })),
      quotes: quoteRows.map(toQuote),
      industry: { negative: indNow, negative_prev: indPrev, neg_pct: share(indNow, others("now", "labelled")), brands_up: upBrands },
      scope,
    };
  }));

  // ---- rising: the focus brand's posts from the last three days, with their likely final views from the tracking curve
  const curve = await db.q<{ day_n: number; share: number }>(
    `select s.day_n, percentile_cont(0.5) within group (order by s.views::float8 / p.views)::float8 as share
     from post_snapshots s join posts p on p.id = s.post_id
     where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.views >= 1000 and p.captured_days >= 7 and s.day_n between 0 and 7 and s.views is not null group by 1`,
    [ws],
  );
  const shareAt = new Map(curve.map((r) => [n(r.day_n), Number(r.share)]));
  const risingRows = await db.q(
    `select p.url, p.platform, p.creator_handle as handle, p.source, left(regexp_replace(coalesce(p.caption, ''), '\\s+', ' ', 'g'), 200) as caption,
            to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, p.views::float8 as views, p.likes, case when p.stance_source = 'model' then p.stance end as stance,
            ($4::date - (p.posted_at at time zone $2)::date)::int as day,
            (select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')::int as comments,
            (select count(*) from comments c where c.post_id = p.id and c.sentiment = 'negative')::int as negative,
            (select count(c.sentiment) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')::int as labelled
     from posts p where p.workspace_id = $1 and p.brand_id = $5 and p.relevant is not false and p.brought_in_by = 'panel' ${platP}
       and p.posted_at >= (($4::date - 2)::timestamp at time zone $2) and (p.views is not null or p.likes is not null)
     order by p.views desc nulls last, p.likes desc nulls last limit 6`,
    [...base, asOf, focus.id],
  );
  const rising: Rising[] = risingRows.map((r) => {
    const day = n(r.day);
    const s = shareAt.get(day);
    return { url: String(r.url), platform: String(r.platform), handle: (r.handle as string) ?? null, source: String(r.source), caption: String(r.caption ?? ""), posted_at: String(r.posted_at), views: nn(r.views), comments: n(r.comments), negative: n(r.negative), likes: nn(r.likes), stance: (r.stance as string) ?? null, day, projected: day <= 2 && s && s > 0.05 && r.views != null ? Math.round(Number(r.views) / s) : null, neg_pct: share(n(r.negative), n(r.labelled)) };
  });

  // ---- amplifiers: the accounts whose posts about the focus brand reached most people, and how their comments leaned
  const ampRows = await db.q(
    `select p.creator_handle as handle, p.platform, max(cr.tier_latest) as tier, max(cr.followers_latest)::int as followers, count(*)::int as posts, coalesce(sum(p.views), 0)::float8 as views, coalesce(sum(p.likes), 0)::int as likes,
            count(*) filter (where p.stance_source = 'model' and p.stance is not null)::int as stanced, count(*) filter (where p.stance_source = 'model' and p.stance = 'negative')::int as against,
            sum((select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject'))::int as comments,
            sum((select count(*) from comments c where c.post_id = p.id and c.sentiment = 'negative'))::int as negative,
            sum((select count(c.sentiment) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject'))::int as labelled,
            (array_agg(p.url order by p.views desc nulls last, p.likes desc nulls last))[1] as top_url
     from posts p left join creators cr on cr.id = p.creator_id
     where p.workspace_id = $1 and p.brand_id = $4 and p.source = 'earned' and p.relevant is not false and p.brought_in_by = 'panel' and p.creator_handle is not null ${platP} and ${inDays("p.posted_at", "$5", "$6")}
     group by 1, 2 order by views desc, likes desc limit 8`,
    [...base, focus.id, from, to],
  );
  const amplifiers: Amplifier[] = ampRows.map((r) => ({ handle: String(r.handle), platform: String(r.platform), tier: (r.tier as string) ?? null, followers: nn(r.followers), posts: n(r.posts), views: n(r.views), likes: n(r.likes), comments: n(r.comments), neg_pct: n(r.labelled) >= 10 ? share(n(r.negative), n(r.labelled)) : null, top_url: String(r.top_url), stanced: n(r.stanced), against: n(r.against) }));

  // ---- own channels: how the focus brand's own posts were received, against the other brands' own posts
  const ownRows = await db.q(
    `select p.platform, p.brand_id = $4 as mine, count(*)::int as posts, coalesce(sum(p.views), 0)::float8 as views,
            coalesce(sum(k.comments), 0)::int as comments, coalesce(sum(k.negative), 0)::int as negative, coalesce(sum(k.labelled), 0)::int as labelled, coalesce(sum(k.replies), 0)::int as replies
     from posts p
     left join lateral (
       select count(*) filter (where c.sentiment_source is distinct from 'subject') as comments, count(*) filter (where c.sentiment = 'negative') as negative,
              count(c.sentiment) filter (where c.sentiment_source is distinct from 'subject') as labelled, count(*) filter (where c.sentiment_source = 'subject') as replies
       from comments c where c.post_id = p.id) k on true
     where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.source = 'owned' ${platP} and ${inDays("p.posted_at", "$5", "$6")}
     group by 1, 2`,
    [...base, focus.id, from, to],
  );
  const own: OwnRow[] = [...new Set(ownRows.map((r) => String(r.platform)))].map((pl) => {
    const m = ownRows.find((r) => r.platform === pl && r.mine);
    const o = ownRows.filter((r) => r.platform === pl && !r.mine);
    return {
      platform: pl, posts: n(m?.posts), views: n(m?.views), comments: n(m?.comments), neg_pct: share(n(m?.negative), n(m?.labelled)), replies: n(m?.replies),
      others_neg_pct: share(o.reduce((a, r) => a + n(r.negative), 0), o.reduce((a, r) => a + n(r.labelled), 0)),
    };
  }).filter((r) => r.posts > 0).sort((a, b) => b.comments - a.comments);
  const ownWorst = (await db.q(
    `select p.url, p.platform, p.creator_handle as handle, p.source, left(regexp_replace(coalesce(p.caption, ''), '\\s+', ' ', 'g'), 200) as caption, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, p.views::float8 as views, p.likes,
            count(c.id)::int as comments, count(c.id) filter (where c.sentiment = 'negative')::int as negative
     from posts p join comments c on c.post_id = p.id and c.sentiment_source is distinct from 'subject' and not coalesce(c.off_topic, false)
     where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.brand_id = $4 and p.source = 'owned' ${platP} and ${inDays("c.posted_at", "$5", "$6")}
     group by p.id having count(c.id) filter (where c.sentiment = 'negative') > 0 order by negative desc limit 3`,
    [...base, focus.id, from, to],
  )).map((r) => ({ url: String(r.url), platform: String(r.platform), handle: (r.handle as string) ?? null, source: String(r.source), caption: String(r.caption ?? ""), posted_at: String(r.posted_at), views: nn(r.views), comments: n(r.comments), negative: n(r.negative), likes: nn(r.likes) }));

  // ---- for customer service: negative comments that are service problems, not reputation stories
  const serviceWhere = (a: string, b: string) => `and c.sentiment = 'negative' and c.theme ~* ${a} and c.theme !~* ${b}`;
  const themed = await db.one<{ any: boolean }>(`select exists (select 1 from comments c where c.workspace_id = $1 and c.theme is not null and c.theme <> 'unknown' and ${COMMENT_IN_PANEL("c")}) as any`, [ws]);
  const [serviceCount, serviceQuotes] = await Promise.all([
    db.one<{ n: number }>(`select count(*)::int as n from ${onBrandComments} and p.brand_id = $4 and ${inDays("c.posted_at", "$5", "$6")} ${serviceWhere("$7", "$8")}`, [...base, focus.id, from, to, SERVICE_THEME.source, NOT_SERVICE.source]),
    db.q(quoteSql(serviceWhere("$8", "$9")), [...base, focus.id, from, to, 6, SERVICE_THEME.source, NOT_SERVICE.source]),
  ]);

  // ---- competitive: every brand on the same measures, now and before
  const compRows = await db.q(
    `with posts_w as (
       select p.brand_id, count(*) filter (where ${inDays("p.posted_at", "$4", "$5")})::int as posts, count(*) filter (where ${inDays("p.posted_at", "$6", "$7")})::int as posts_prev,
              coalesce(sum(p.views) filter (where ${inDays("p.posted_at", "$4", "$5")}), 0)::float8 as views
       from posts p where p.workspace_id = $1 and p.relevant is not false and p.brought_in_by = 'panel' ${platP} group by 1),
     comments_w as (
       select p.brand_id, count(*) filter (where ${inDays("c.posted_at", "$4", "$5")})::int as comments,
              count(*) filter (where c.sentiment = 'negative' and ${inDays("c.posted_at", "$4", "$5")})::int as negative,
              count(c.sentiment) filter (where ${inDays("c.posted_at", "$4", "$5")})::int as labelled,
              count(*) filter (where c.sentiment = 'negative' and ${inDays("c.posted_at", "$6", "$7")})::int as negative_prev,
              count(c.sentiment) filter (where ${inDays("c.posted_at", "$6", "$7")})::int as labelled_prev,
              count(*) filter (where c.purchase_intent and ${inDays("c.posted_at", "$4", "$5")})::int as intent
       from ${onBrandComments} group by 1)
     select b.id, b.name, coalesce(pw.posts, 0) as posts, coalesce(pw.posts_prev, 0) as posts_prev, coalesce(pw.views, 0) as views,
            coalesce(cw.comments, 0) as comments, coalesce(cw.negative, 0) as negative, coalesce(cw.labelled, 0) as labelled,
            coalesce(cw.negative_prev, 0) as negative_prev, coalesce(cw.labelled_prev, 0) as labelled_prev, coalesce(cw.intent, 0) as intent
     from brands b left join posts_w pw on pw.brand_id = b.id left join comments_w cw on cw.brand_id = b.id
     where b.workspace_id = $1`,
    [...base, from, to, prevFrom, prevTo],
  );
  const totalPosts = compRows.reduce((a, r) => a + n(r.posts), 0);
  const competitive: BrandRow[] = compRows.map((r) => {
    const id = String(r.id);
    const top = [...topics.entries()].filter(([, t]) => !t.catch_all).map(([tid, t]) => ({
      topic: t.label,
      negative: sum((x) => x.brand_id === id && x.win === "now" && tKey(x) === tid, "negative"),
      negative_prev: sum((x) => x.brand_id === id && x.win === "prev" && tKey(x) === tid, "negative"),
    })).filter((x) => x.negative >= minIssue && x.negative >= Math.max(1, x.negative_prev) * 1.5).sort((a, b) => b.negative - a.negative)[0] ?? null;
    return {
      id, name: String(r.name), is_focus: id === focus.id, is_client: id === client, posts: n(r.posts), posts_prev: n(r.posts_prev), sov: share(n(r.posts), totalPosts), views: n(r.views), comments: n(r.comments),
      neg_pct: share(n(r.negative), n(r.labelled)), neg_pct_prev: share(n(r.negative_prev), n(r.labelled_prev)),
      intent_pct: share(n(r.intent), n(r.comments)), top_issue: top,
    };
  }).filter((b) => b.posts > 0 || b.comments > 0 || b.is_focus).sort((a, b) => b.posts - a.posts);

  // ---- around one subject: each platform on its own, and the accounts commenters pull in (Refal, 14 Oct 2026)
  const [byPlatform, tagged] = per_comment
    ? await Promise.all([platformSplit(db, base, focus.id, from, to, under, platC, platP, inDays, topics, toQuote), taggedAccounts(db, base, focus.id, from, to, under, platC, inDays)])
    : [undefined, undefined];

  // ---- data health
  const covRows = await db.q(
    `select p.platform, to_char(min(p.posted_at at time zone $2), 'YYYY-MM-DD') as first, to_char(max(p.posted_at at time zone $2), 'YYYY-MM-DD') as last, count(*)::int as posts,
            count(*) filter (where p.relevant = false)::int as off_topic, coalesce(sum(p.comments_count), 0)::float8 as reported,
            (select count(*) from comments c where c.workspace_id = $1 and c.platform = p.platform and ${COMMENT_IN_PANEL("c")})::int as comments
     from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' group by 1 order by posts desc`,
    [ws, tz],
  );
  const coverage: Coverage[] = covRows.map((r) => ({ platform: String(r.platform), first: String(r.first), last: String(r.last), posts: n(r.posts), off_topic: n(r.off_topic), comments: n(r.comments), reported_comments: n(r.reported) }));
  const notes: string[] = [];
  if (to === settled && settled < asOf) notes.push(`Comments for ${dayMonth(addDays(settled, 1))}${addDays(settled, 1) < asOf ? ` to ${dayMonth(asOf)}` : ""} are still arriving (half of a post's comments come in its first 15 hours), so this view ends on ${dayMonth(settled)}.`);
  else if (to > settled) notes.push(`Comments for ${dayMonth(addDays(settled, 1))} to ${dayMonth(to)} are still arriving (half of a post's comments come in its first 15 hours); those days will grow.`);
  // where the workspace says when tracking began, that is said once; a platform that started later still gets its own note
  if (win.since) notes.push(`Tracked since ${dayMonth(win.since)} ${win.since.slice(0, 4)}${coverage.length ? ` on ${coverage.map((c) => PLATFORM_LABEL[c.platform] ?? c.platform).join(", ").replace(/, ([^,]*)$/, " and $1")}` : ""}.${prevTo < win.since ? " Nothing before it is tracked, so there is no earlier window to compare with." : ""}`);
  for (const c of coverage) if (c.first > prevFrom && !(win.since && c.first <= addDays(win.since, 1))) notes.push(`${PLATFORM_LABEL[c.platform] ?? c.platform} has been tracked since ${dayMonth(c.first)}, so comparisons with the previous ${f.days} days include it on one side only.`);
  const weekly = await db.q<{ wk: string; posts: number }>(
    `select to_char(date_trunc('week', p.posted_at at time zone $2), 'YYYY-MM-DD') as wk, count(*)::int as posts from posts p where p.workspace_id = $1 and p.brought_in_by = 'panel' and p.posted_at >= (($3::date - 63)::timestamp at time zone $2) group by 1 order by 1`,
    [ws, tz, asOf],
  );
  const wk = weekly.map((r) => n(r.posts));
  if (wk.length >= 4) {
    const last = wk.at(-2) ?? 0, before = wk.slice(0, -2);
    const median = [...before].sort((a, b) => a - b)[Math.floor(before.length / 2)] ?? 0;
    if (median > 0 && (last > median * 2.5 || last < median / 2.5)) notes.push(`Collection changed: the last full week has ${last.toLocaleString("en-US")} posts against a usual ${median.toLocaleString("en-US")}. Counts of posts move with collection; shares and sentiment are the safer read.`);
  }

  // the reason, in words
  const lvl = status.level;
  const d = status.day;
  // where posts carry a stance they are counted with the comments, and the words say so
  const said = n(kn?.post_voices) > 0 ? "posts and comments" : "comments";
  status.reason = !d || d.comments < alert.min_comments
    ? `Not enough ${said} about ${focus.name} on ${dayMonth(d?.d ?? asOf)} to judge (${d?.comments ?? 0}; the rule needs ${alert.min_comments}).`
    : status.baseline.neg_pct == null
      ? `${d.neg_pct}% of ${d.comments.toLocaleString("en-US")} ${said} about ${focus.name} were negative on ${dayMonth(d.d)}. There is no normal level to compare with yet: that needs a week of ordinary days before it, and the capture starts ${status.baseline.days ? "too close to this" : "here"}.`
      : `${d.neg_pct}% of ${d.comments.toLocaleString("en-US")} ${said} about ${focus.name} were negative on ${dayMonth(d.d)}, against a ${alert.baseline_days}-day norm of ${status.baseline.neg_pct}%${status.multiple != null ? ` (${status.multiple}×)` : ""}.${lvl === "recovering" ? " Calm again after an issue in the last week." : ""}`;

  return {
    ...(win.since ? { tracked_since: win.since } : {}),
    as_of: asOf, settled, tz, focus: { id: focus.id, name: focus.name, is_client: focus.id === client }, brands: brands.map((b) => ({ id: b.id, name: b.name })), platforms,
    filters: { ...f, from, to, prev_from: prevFrom, prev_to: prevTo },
    voice_posts: n(kn?.post_voices), conversation, per_comment, other_comments: { now: n(other?.now), prev: n(other?.prev) }, status, kpis, issues, rising, narratives, amplifiers, own, own_worst: ownWorst,
    service: { measured: !!themed?.any, total: n(serviceCount?.n), quotes: serviceQuotes.map(toQuote) },
    competitive, coverage, off_topic_posts: coverage.reduce((a, c) => a + c.off_topic, 0), notes,
    ...(byPlatform ? { by_platform: byPlatform } : {}), ...(tagged ? { tagged } : {}),
  };
}

type InDays = (col: string, a: string, b: string) => string;

/**
 * Each platform of a case on its own: its post (the most commented, with the stance of all of them), its comments
 * by their own label, the topics they fall under, the pace and the busiest hour. Comments only here, never posts
 * standing in as voices, so a platform's numbers are the crowd under its post. $1 workspace, $2 tz, $3 platform.
 */
async function platformSplit(
  db: SkillDb, base: unknown[], brand: string, from: string, to: string, under: string, platC: string, platP: string, inDays: InDays,
  topics: Map<string, { label: string; catch_all: boolean }>, toQuote: (r: Record<string, unknown>) => Quote,
): Promise<PlatformSplit[]> {
  const args = [...base, brand, from, to];
  const where = `c.workspace_id = $1 and ${under} and p.brand_id = $4 and c.sentiment_source is distinct from 'subject' and c.posted_at is not null ${platC} and ${inDays("c.posted_at", "$5", "$6")}`;
  const postWhere = `p.workspace_id = $1 and p.brand_id = $4 and p.relevant is not false and p.brought_in_by = 'panel' ${platP} and ${inDays("p.posted_at", "$5", "$6")}`;
  const [cRows, pRows, tops, tRows, hRows, likedRows] = await Promise.all([
    db.q(`select c.platform, count(*) filter (where not coalesce(c.off_topic, false))::int as n,
                 count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'negative')::int as negative,
                 count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'neutral')::int as neutral,
                 count(*) filter (where not coalesce(c.off_topic, false) and c.sentiment = 'positive')::int as positive,
                 count(c.sentiment) filter (where not coalesce(c.off_topic, false))::int as labelled,
                 count(*) filter (where c.off_topic)::int as other, to_char(min(c.posted_at) at time zone $2, 'YYYY-MM-DD HH24:MI') as first_at, extract(epoch from min(c.posted_at))::float8 as first_ep
          from comments c join posts p on p.id = c.post_id where ${where} group by 1`, args),
    db.q(`select p.platform, count(*)::int as n, count(*) filter (where p.stance = 'negative')::int as negative, count(*) filter (where p.stance = 'neutral')::int as neutral,
                 count(*) filter (where p.stance = 'positive')::int as positive, count(p.stance)::int as labelled, extract(epoch from min(p.posted_at))::float8 as first_ep
          from posts p where ${postWhere} and p.source = 'earned' group by 1`, args),
    // counted once, then joined: inlined, the planner guessed one post and ran the count again for every post (34 s on kahf-threads)
    db.q(`with cc as materialized (select c.post_id, count(*)::int as n, count(*) filter (where c.sentiment = 'negative')::int as neg from comments c join posts p on p.id = c.post_id where ${where} group by 1)
          select distinct on (p.platform) p.platform, p.url, p.creator_handle as handle, p.source, coalesce(p.caption, '') as caption, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD HH24:MI') as posted_at,
                 p.views, p.likes, p.stance, coalesce(cc.n, 0) as comments, coalesce(cc.neg, 0) as negative
          from posts p left join cc on cc.post_id = p.id where ${postWhere}
          order by p.platform, cc.n desc nulls last, p.views desc nulls last, p.posted_at`, args),
    db.q(`select c.platform, c.topic_id, count(*)::int as n, count(*) filter (where c.sentiment = 'negative')::int as negative
          from comments c join posts p on p.id = c.post_id where ${where} and not coalesce(c.off_topic, false) group by 1, 2`, args),
    db.q(`select c.platform, to_char(date_trunc('hour', c.posted_at at time zone $2), 'YYYY-MM-DD HH24:00') as h, count(*)::int as n
          from comments c join posts p on p.id = c.post_id where ${where} and not coalesce(c.off_topic, false) group by 1, 2 order by 1, 2`, args),
    db.q(`select * from (select c.text, c.translation, coalesce(c.likes, 0)::int as likes, c.platform, p.url, c.sentiment, c.theme,
                 row_number() over (partition by c.platform order by coalesce(c.likes, 0) desc, length(c.text) desc) as rk
          from comments c join posts p on p.id = c.post_id where ${where} and not coalesce(c.off_topic, false) and c.text is not null and coalesce(c.likes, 0) > 0) x where rk <= 2`, args),
  ]);
  const platforms = [...new Set([...pRows, ...cRows].map((r) => String(r.platform)))];
  const split = (r: Record<string, unknown> | undefined): Split => ({ n: n(r?.n), negative: n(r?.negative), neutral: n(r?.neutral), positive: n(r?.positive), labelled: n(r?.labelled) });
  const out = platforms.map((pl): PlatformSplit => {
    const c = cRows.find((r) => r.platform === pl);
    const p = pRows.find((r) => r.platform === pl);
    const top = tops.find((r) => r.platform === pl);
    const hours = hRows.filter((r) => r.platform === pl).map((r) => ({ at: String(r.h), n: n(r.n) }));
    // the pace: hour by hour while the thread is young, day by day once it runs past two days
    const span = hours.length ? (Date.parse(hours.at(-1)!.at.replace(" ", "T") + ":00Z") - Date.parse(hours[0].at.replace(" ", "T") + ":00Z")) / 3600000 + 1 : 0;
    let bucket: "hour" | "day" = "hour";
    let series = hours;
    if (span > 48) {
      bucket = "day";
      const byDay = new Map<string, number>();
      for (const h of hours) byDay.set(h.at.slice(0, 10), (byDay.get(h.at.slice(0, 10)) ?? 0) + h.n);
      series = [...byDay.entries()].map(([at, k]) => ({ at, n: k }));
    } else if (hours.length) {
      // every hour from the first to the last, quiet ones as zero, so the bars read as time
      const filled: { at: string; n: number }[] = [];
      const t0 = Date.parse(hours[0].at.replace(" ", "T") + ":00Z");
      const have = new Map(hours.map((h) => [h.at, h.n]));
      for (let k = 0; k < span; k++) {
        const at = new Date(t0 + k * 3600000).toISOString().slice(0, 13).replace("T", " ") + ":00";
        filled.push({ at, n: have.get(at) ?? 0 });
      }
      series = filled;
    }
    const peak = hours.reduce<{ at: string; n: number } | null>((m, h) => (!m || h.n > m.n ? h : m), null);
    const firstPost = p?.first_ep != null ? Number(p.first_ep) : null;
    const firstComment = c?.first_ep != null ? Number(c.first_ep) : null;
    const topicList = tRows.filter((r) => r.platform === pl).map((r) => {
      const t = r.topic_id ? topics.get(String(r.topic_id)) : undefined;
      return { topic: t?.label ?? "No topic", catch_all: t?.catch_all ?? !r.topic_id, n: n(r.n), negative: n(r.negative) };
    }).sort((a, b) => Number(a.catch_all) - Number(b.catch_all) || b.n - a.n);
    return {
      platform: pl,
      posts: split(p),
      top_post: top ? { url: String(top.url), platform: pl, handle: (top.handle as string) ?? null, source: String(top.source), caption: String(top.caption), posted_at: String(top.posted_at), views: nn(top.views), likes: nn(top.likes), comments: n(top.comments), negative: n(top.negative), stance: (top.stance as string) ?? null } : null,
      comments: split(c),
      other: n(c?.other),
      first_comment: c?.first_at ? String(c.first_at) : null,
      first_after_min: firstPost != null && firstComment != null ? Math.max(0, Math.round((firstComment - firstPost) / 60)) : null,
      peak: peak && peak.n > 0 ? peak : null,
      bucket,
      series,
      topics: topicList,
      liked: likedRows.filter((r) => r.platform === pl).map(toQuote),
    };
  });
  return out.sort((a, b) => b.comments.n - a.comments.n || b.posts.n - a.posts.n);
}

/**
 * The accounts commenters tag (@handle) under the subject's posts, each counted once per comment: a rival brand asked to
 * step in, friends called over, the poster. Comments about something else count too: a tag is who is being pulled in,
 * whatever the comment's label. The subject's own handles and the posts' authors are marked.
 */
async function taggedAccounts(db: SkillDb, base: unknown[], brand: string, from: string, to: string, under: string, platC: string, inDays: InDays): Promise<{ comments: number; tagging: number; rows: Tagged[] }> {
  const args = [...base, brand, from, to];
  const where = `c.workspace_id = $1 and ${under} and p.brand_id = $4 and c.sentiment_source is distinct from 'subject' and c.posted_at is not null ${platC} and ${inDays("c.posted_at", "$5", "$6")}`;
  const [tot, rows] = await Promise.all([
    db.one(`select count(*)::int as comments, count(*) filter (where c.text ~ '@[A-Za-z0-9_]')::int as tagging from comments c join posts p on p.id = c.post_id where ${where}`, args),
    db.q(`with t as (
            select distinct c.id, c.platform, c.sentiment, coalesce(c.likes, 0) as likes, c.text, p.url, lower(p.creator_handle) as poster, lower(regexp_replace(m[1], '\\.+$', '')) as handle
            from comments c join posts p on p.id = c.post_id, regexp_matches(c.text, '@([A-Za-z0-9_.]{2,30})', 'g') as m
            where ${where} and c.text like '%@%')
          select t.handle, count(distinct t.id)::int as comments, array_agg(distinct t.platform) as platforms,
                 count(distinct t.id) filter (where t.sentiment = 'negative')::int as negative, bool_or(t.handle = t.poster) as poster,
                 exists (select 1 from brands b where b.id = $4 and lower(t.handle) in (lower(b.tiktok_handle), lower(b.instagram_handle))) as subject,
                 (array_agg(t.text order by t.likes desc, length(t.text) desc))[1] as example, (array_agg(t.url order by t.likes desc, length(t.text) desc))[1] as url
          from t group by t.handle order by 2 desc, 1 limit 12`, args),
  ]);
  return {
    comments: n(tot?.comments),
    tagging: n(tot?.tagging),
    rows: rows.map((r) => ({ handle: String(r.handle), comments: n(r.comments), platforms: (r.platforms as string[]) ?? [], negative: n(r.negative), poster: !!r.poster, subject: !!r.subject, example: String(r.example ?? "").replace(/\s+/g, " ").trim(), url: String(r.url) })),
  };
}
