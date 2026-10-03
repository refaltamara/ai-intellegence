/**
 * The PR dashboard (DECISIONS, 3 Oct 2026): the reputation view a PR team checks every
 * morning, standard for every company. One brand in focus (the client by default),
 * the others as the benchmark. Seven parts: the status ladder, issues building, what
 * is rising, narratives, amplifiers, own channels with the customer-service list,
 * the competitive view, and data health.
 *
 * Every number is computed here in SQL; the page only lays it out. Posts judged not
 * about their brand (posts.relevant = false) and the brands' own replies never count.
 * The alert rule comes from the role model (src/roles/model.ts).
 */
import { PLATFORM_LABEL } from "../skills/common";
import { dayMonth } from "../competitor/view";
import { SkillDb } from "../skills/db";
import { PR, type RoleModel } from "../roles/model";

export type Level = "calm" | "watch" | "issue" | "crisis" | "recovering";
export const WINDOWS = [7, 14, 30] as const;
export type WindowDays = (typeof WINDOWS)[number];

export type PrFilters = { brand: string; days: number; platform: string };
export type DayPoint = { d: string; comments: number; negative: number; neg_pct: number | null; level: Level };
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
export type PostRef = { url: string; platform: string; handle: string | null; source: string; caption: string; posted_at: string; views: number | null; comments: number; negative: number };
export type Quote = { text: string; translation: string | null; likes: number; platform: string; url: string; sentiment: string | null; theme: string | null };
export type Issue = {
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
export type Narrative = { topic_id: string; topic: string; catch_all: boolean; comments: number; comments_prev: number; share: number | null; neg_pct: number | null; neg_pct_prev: number | null; csat: number | null; quote: Quote | null };
export type Amplifier = { handle: string; platform: string; tier: string | null; followers: number | null; posts: number; views: number; comments: number; neg_pct: number | null; top_url: string };
export type OwnRow = { platform: string; posts: number; views: number; comments: number; neg_pct: number | null; replies: number; others_neg_pct: number | null };
export type BrandRow = { id: string; name: string; is_focus: boolean; is_client: boolean; posts: number; posts_prev: number; sov: number | null; views: number; comments: number; neg_pct: number | null; neg_pct_prev: number | null; csat: number | null; intent_pct: number | null; top_issue: { topic: string; negative: number; negative_prev: number } | null };
export type Coverage = { platform: string; first: string; last: string; posts: number; off_topic: number; comments: number; reported_comments: number };

export type PrDashboardData = {
  as_of: string;
  /** the last day whose comments have settled; windows end here */
  settled: string;
  tz: string;
  focus: { id: string; name: string; is_client: boolean };
  brands: { id: string; name: string }[];
  platforms: string[];
  filters: PrFilters & { from: string; to: string; prev_from: string; prev_to: string };
  status: Status;
  kpis: { mentions: Kpi; reach: Kpi; comments: Kpi; neg_pct: Kpi; csat: Kpi; intent_pct: Kpi };
  issues: Issue[];
  rising: Rising[];
  narratives: Narrative[];
  amplifiers: Amplifier[];
  own: OwnRow[];
  own_worst: PostRef[];
  service: { total: number; quotes: Quote[] };
  competitive: BrandRow[];
  coverage: Coverage[];
  off_topic_posts: number;
  notes: string[];
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

/** The status ladder for one day, from that day's negative share against the baseline. */
export function levelFor(neg: number, comments: number, baselinePct: number | null, alert: NonNullable<RoleModel["alert"]>): { level: Level; multiple: number | null } {
  const pctNow = comments > 0 ? (neg / comments) * 100 : null;
  const multiple = pctNow != null && baselinePct ? Math.round((pctNow / baselinePct) * 10) / 10 : null;
  if (comments < alert.min_comments || multiple == null) return { level: "calm", multiple };
  if (multiple >= alert.negative_multiple * 1.5 && neg >= alert.min_comments) return { level: "crisis", multiple };
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
    return { d: x.d, comments: x.comments, negative: x.negative, neg_pct: share(x.negative, x.comments), level: shown };
  });
}

/**
 * The last day whose comments have settled: comments keep arriving for a day or two after a post,
 * so the newest days of any capture are thin. A day counts once it carries at least half the usual
 * daily comments (median of the 28 days before it) and the alert's minimum.
 */
async function settledDay(db: SkillDb, ws: string, tz: string, asOf: string, alert: NonNullable<RoleModel["alert"]>): Promise<string> {
  const rows = await db.q<{ d: string; n: number }>(
    `with days as (select generate_series($3::date - 35, $3::date, interval '1 day')::date as d)
     select to_char(days.d, 'YYYY-MM-DD') as d, (select count(*) from comments c where c.workspace_id = $1 and c.posted_at >= (days.d::timestamp at time zone $2) and c.posted_at < ((days.d + 1)::timestamp at time zone $2))::int as n
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

type Basics = { tz: string; client: string | null; brands: { id: string; name: string }[]; platforms: string[]; asOf: string };

async function workspaceBasics(db: SkillDb, ws: string): Promise<Basics | null> {
  const w = await db.one<{ tz: string; client: string | null }>("select tz, client_brand_id as client from workspaces where id = $1", [ws]);
  if (!w) return null;
  const brands = await db.q<{ id: string; name: string }>("select id, name from brands where workspace_id = $1 order by name", [ws]);
  if (!brands.length) return null;
  const platforms = (await db.q<{ platform: string }>("select distinct platform from posts where workspace_id = $1 order by 1", [ws])).map((r) => r.platform);
  const asOfRow = await db.one<{ d: string }>(
    `select to_char(greatest((select max(posted_at) from comments where workspace_id = $1), (select max(posted_at) from posts where workspace_id = $1)) at time zone $2, 'YYYY-MM-DD') as d`,
    [ws, w.tz],
  );
  return { tz: w.tz, client: w.client, brands, platforms, asOf: asOfRow?.d ?? new Date().toISOString().slice(0, 10) };
}

/** The dashboard: the window chosen in the URL, ending on the last settled day. */
export async function prDashboard(ws: string, sp: Record<string, string | string[] | undefined>, role: RoleModel = PR): Promise<PrDashboardData | null> {
  const db = new SkillDb();
  const basics = await workspaceBasics(db, ws);
  if (!basics) return null;
  const f = readPrFilters(sp, basics.brands.map((b) => b.id), basics.client);
  const settled = await settledDay(db, ws, basics.tz, basics.asOf, role.alert ?? PR.alert!);
  return reputationFacts(ws, { focus: f.brand, from: addDays(settled, -(f.days - 1)), to: settled, platform: f.platform }, role, db, basics);
}

/**
 * The reputation facts for one brand over any window (the dashboard's rolling days, a deck's week or month),
 * against the same number of days before it. The status is read on the window's last day, or on the last
 * settled day when the window runs past it.
 */
export async function reputationFacts(ws: string, win: { focus: string; from: string; to: string; platform: string; prev?: { from: string; to: string } }, role: RoleModel = PR, db: SkillDb = new SkillDb(), basics?: Basics): Promise<PrDashboardData | null> {
  const alert = role.alert ?? PR.alert!;
  const b0 = basics ?? (await workspaceBasics(db, ws));
  if (!b0) return null;
  const { tz, brands, platforms, asOf, client } = b0;
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
  const onBrandComments = `comments c join posts p on p.id = c.post_id
     where c.workspace_id = $1 and p.relevant is not false and c.sentiment_source is distinct from 'subject' and c.posted_at is not null ${platC}`;
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
    return { d: x.d, comments: n(x.comments), negative: n(x.negative), baseline_pct: prior.length >= 7 && pc >= alert.min_comments ? (pn / pc) * 100 : null };
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
    rule: `Issue: a day's negative share of comments about ${focus.name} at ${alert.negative_multiple}× its ${alert.baseline_days}-day norm or more, with at least ${alert.min_comments} comments that day. Crisis: ${alert.negative_multiple * 1.5}× or more with ${alert.min_comments}+ negative comments. Watch: ${1 + (alert.negative_multiple - 1) / 2}× or more. Recovering: calm again within 7 days of an issue.`,
  };

  // ---- headline numbers, now and before
  const kpiRow = async (a: string, b: string) =>
    db.one<{ mentions: number; reach: number; comments: number; negative: number; labelled: number; csat: number | null; intent: number }>(
      `select (select count(*) from posts p where p.workspace_id = $1 and p.brand_id = $4 and p.relevant is not false ${platP} and ${inDays("p.posted_at", "$5", "$6")})::int as mentions,
              (select coalesce(sum(p.views), 0) from posts p where p.workspace_id = $1 and p.brand_id = $4 and p.relevant is not false ${platP} and ${inDays("p.posted_at", "$5", "$6")})::float8 as reach,
              count(c.id)::int as comments, count(c.id) filter (where c.sentiment = 'negative')::int as negative, count(c.sentiment)::int as labelled,
              avg(c.csat)::float8 as csat, count(c.id) filter (where c.purchase_intent)::int as intent
       from ${onBrandComments} and p.brand_id = $4 and ${inDays("c.posted_at", "$5", "$6")}`,
      [...base, focus.id, a, b],
    );
  const [kn, kp] = await Promise.all([kpiRow(from, to), kpiRow(prevFrom, prevTo)]);
  const kpis = {
    mentions: { now: n(kn?.mentions), prev: n(kp?.mentions) },
    reach: { now: n(kn?.reach), prev: n(kp?.reach) },
    comments: { now: n(kn?.comments), prev: n(kp?.comments) },
    neg_pct: { now: share(n(kn?.negative), n(kn?.labelled)), prev: share(n(kp?.negative), n(kp?.labelled)) },
    csat: { now: kn?.csat == null ? null : Math.round(Number(kn.csat) * 100) / 100, prev: kp?.csat == null ? null : Math.round(Number(kp.csat) * 100) / 100 },
    intent_pct: { now: share(n(kn?.intent), n(kn?.comments)), prev: share(n(kp?.intent), n(kp?.comments)) },
  };

  // ---- topics for everyone in both windows (narratives, issues, the industry check)
  const topicRows = await db.q<{ topic_id: string | null; label: string | null; catch_all: boolean | null; brand_id: string; win: string; comments: number; negative: number; labelled: number; csat: number | null }>(
    `select c.topic_id, t.label, t.is_catch_all as catch_all, p.brand_id,
            case when ${inDays("c.posted_at", "$4", "$5")} then 'now' else 'prev' end as win,
            count(*)::int as comments, count(*) filter (where c.sentiment = 'negative')::int as negative, count(c.sentiment)::int as labelled, avg(c.csat)::float8 as csat
     from comments c join posts p on p.id = c.post_id left join topics t on t.id = c.topic_id
     where c.workspace_id = $1 and p.relevant is not false and c.sentiment_source is distinct from 'subject' and c.posted_at is not null ${platC}
       and ${inDays("c.posted_at", "$6", "$5")}
     group by 1, 2, 3, 4, 5`,
    [...base, from, to, prevFrom],
  );
  const tKey = (r: { topic_id: string | null }) => r.topic_id ?? "";
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
    const csatW = now.reduce((a, r) => a + (r.csat == null ? 0 : Number(r.csat) * n(r.comments)), 0);
    narratives.push({
      topic_id: id, topic: t.label, catch_all: t.catch_all, comments: c, comments_prev: prev.reduce((a, r) => a + n(r.comments), 0), share: share(c, focusNowTotal),
      neg_pct: share(now.reduce((a, r) => a + n(r.negative), 0), lab), neg_pct_prev: share(prev.reduce((a, r) => a + n(r.negative), 0), prev.reduce((a, r) => a + n(r.labelled), 0)),
      csat: c ? Math.round((csatW / c) * 100) / 100 : null, quote: null,
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
      db.q(`select p.url, p.platform, p.creator_handle as handle, p.source, left(regexp_replace(coalesce(p.caption, ''), '\\s+', ' ', 'g'), 200) as caption, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, p.views::float8 as views,
                   count(*)::int as comments, count(*) filter (where c.sentiment = 'negative')::int as negative
            from ${onBrandComments} and p.brand_id = $4 and c.topic_id = $7 and ${inDays("c.posted_at", "$5", "$6")}
            group by p.id order by negative desc, comments desc limit 3`, [...base, focus.id, from, to, id]),
      db.q(quoteSql("and c.topic_id = $8 and c.sentiment = 'negative'"), [...base, focus.id, from, to, 3, id]),
    ]);
    const series = dailyRows.map((r) => ({ d: r.d, negative: n(r.negative) }));
    const peak = series.reduce<{ d: string; negative: number } | null>((a, r) => (!a || r.negative > a.negative ? r : a), null);
    const firstDay = series.find((r) => r.negative > 0)?.d ?? null;
    const last3 = series.slice(-3).reduce((a, r) => a + r.negative, 0);
    const prev3 = series.slice(-6, -3).reduce((a, r) => a + r.negative, 0);
    const stage: Issue["stage"] = peak && series.slice(-2).some((r) => r.d === peak.d) ? "peaking" : last3 > prev3 * 1.25 ? "building" : last3 < prev3 * 0.75 ? "fading" : "steady";
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
      topic_id: id, topic: t.catch_all ? "Not in a topic" : t.label, catch_all: t.catch_all, negative: mineNow, negative_prev: minePrev, comments: mine("now", "comments"), neg_pct: share(mineNow, mine("now", "labelled")),
      stage, first_day: firstDay, peak_day: peak?.negative ? peak.d : null, daily: series,
      platforms: platRows.map((r) => ({ platform: r.platform, negative: n(r.negative) })),
      themes: themeRows.map((r) => ({ theme: r.theme, n: n(r.n) })),
      posts: postRows.map((r) => ({ url: String(r.url), platform: String(r.platform), handle: (r.handle as string) ?? null, source: String(r.source), caption: String(r.caption ?? ""), posted_at: String(r.posted_at), views: nn(r.views), comments: n(r.comments), negative: n(r.negative) })),
      quotes: quoteRows.map(toQuote),
      industry: { negative: indNow, negative_prev: indPrev, neg_pct: share(indNow, others("now", "labelled")), brands_up: upBrands },
      scope,
    };
  }));

  // ---- rising: the focus brand's posts from the last three days, with their likely final views from the tracking curve
  const curve = await db.q<{ day_n: number; share: number }>(
    `select s.day_n, percentile_cont(0.5) within group (order by s.views::float8 / p.views)::float8 as share
     from post_snapshots s join posts p on p.id = s.post_id
     where p.workspace_id = $1 and p.views >= 1000 and p.captured_days >= 7 and s.day_n between 0 and 7 and s.views is not null group by 1`,
    [ws],
  );
  const shareAt = new Map(curve.map((r) => [n(r.day_n), Number(r.share)]));
  const risingRows = await db.q(
    `select p.url, p.platform, p.creator_handle as handle, p.source, left(regexp_replace(coalesce(p.caption, ''), '\\s+', ' ', 'g'), 200) as caption,
            to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, p.views::float8 as views,
            ($4::date - (p.posted_at at time zone $2)::date)::int as day,
            (select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')::int as comments,
            (select count(*) from comments c where c.post_id = p.id and c.sentiment = 'negative')::int as negative,
            (select count(c.sentiment) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject')::int as labelled
     from posts p where p.workspace_id = $1 and p.brand_id = $5 and p.relevant is not false ${platP}
       and p.posted_at >= (($4::date - 2)::timestamp at time zone $2) and p.views is not null
     order by p.views desc limit 6`,
    [...base, asOf, focus.id],
  );
  const rising: Rising[] = risingRows.map((r) => {
    const day = n(r.day);
    const s = shareAt.get(day);
    return { url: String(r.url), platform: String(r.platform), handle: (r.handle as string) ?? null, source: String(r.source), caption: String(r.caption ?? ""), posted_at: String(r.posted_at), views: nn(r.views), comments: n(r.comments), negative: n(r.negative), day, projected: day <= 2 && s && s > 0.05 && r.views != null ? Math.round(Number(r.views) / s) : null, neg_pct: share(n(r.negative), n(r.labelled)) };
  });

  // ---- amplifiers: the accounts whose posts about the focus brand reached most people, and how their comments leaned
  const ampRows = await db.q(
    `select p.creator_handle as handle, p.platform, max(cr.tier_latest) as tier, max(cr.followers_latest)::int as followers, count(*)::int as posts, coalesce(sum(p.views), 0)::float8 as views,
            sum((select count(*) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject'))::int as comments,
            sum((select count(*) from comments c where c.post_id = p.id and c.sentiment = 'negative'))::int as negative,
            sum((select count(c.sentiment) from comments c where c.post_id = p.id and c.sentiment_source is distinct from 'subject'))::int as labelled,
            (array_agg(p.url order by p.views desc nulls last))[1] as top_url
     from posts p left join creators cr on cr.id = p.creator_id
     where p.workspace_id = $1 and p.brand_id = $4 and p.source = 'earned' and p.relevant is not false and p.creator_handle is not null ${platP} and ${inDays("p.posted_at", "$5", "$6")}
     group by 1, 2 order by views desc limit 8`,
    [...base, focus.id, from, to],
  );
  const amplifiers: Amplifier[] = ampRows.map((r) => ({ handle: String(r.handle), platform: String(r.platform), tier: (r.tier as string) ?? null, followers: nn(r.followers), posts: n(r.posts), views: n(r.views), comments: n(r.comments), neg_pct: n(r.labelled) >= 10 ? share(n(r.negative), n(r.labelled)) : null, top_url: String(r.top_url) }));

  // ---- own channels: how the focus brand's own posts were received, against the other brands' own posts
  const ownRows = await db.q(
    `select p.platform, p.brand_id = $4 as mine, count(*)::int as posts, coalesce(sum(p.views), 0)::float8 as views,
            coalesce(sum(k.comments), 0)::int as comments, coalesce(sum(k.negative), 0)::int as negative, coalesce(sum(k.labelled), 0)::int as labelled, coalesce(sum(k.replies), 0)::int as replies
     from posts p
     left join lateral (
       select count(*) filter (where c.sentiment_source is distinct from 'subject') as comments, count(*) filter (where c.sentiment = 'negative') as negative,
              count(c.sentiment) filter (where c.sentiment_source is distinct from 'subject') as labelled, count(*) filter (where c.sentiment_source = 'subject') as replies
       from comments c where c.post_id = p.id) k on true
     where p.workspace_id = $1 and p.source = 'owned' ${platP} and ${inDays("p.posted_at", "$5", "$6")}
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
    `select p.url, p.platform, p.creator_handle as handle, p.source, left(regexp_replace(coalesce(p.caption, ''), '\\s+', ' ', 'g'), 200) as caption, to_char(p.posted_at at time zone $2, 'YYYY-MM-DD') as posted_at, p.views::float8 as views,
            count(c.id)::int as comments, count(c.id) filter (where c.sentiment = 'negative')::int as negative
     from posts p join comments c on c.post_id = p.id and c.sentiment_source is distinct from 'subject'
     where p.workspace_id = $1 and p.brand_id = $4 and p.source = 'owned' ${platP} and ${inDays("c.posted_at", "$5", "$6")}
     group by p.id having count(c.id) filter (where c.sentiment = 'negative') > 0 order by negative desc limit 3`,
    [...base, focus.id, from, to],
  )).map((r) => ({ url: String(r.url), platform: String(r.platform), handle: (r.handle as string) ?? null, source: String(r.source), caption: String(r.caption ?? ""), posted_at: String(r.posted_at), views: nn(r.views), comments: n(r.comments), negative: n(r.negative) }));

  // ---- for customer service: negative comments that are service problems, not reputation stories
  const serviceWhere = (a: string, b: string) => `and c.sentiment = 'negative' and c.theme ~* ${a} and c.theme !~* ${b}`;
  const [serviceCount, serviceQuotes] = await Promise.all([
    db.one<{ n: number }>(`select count(*)::int as n from ${onBrandComments} and p.brand_id = $4 and ${inDays("c.posted_at", "$5", "$6")} ${serviceWhere("$7", "$8")}`, [...base, focus.id, from, to, SERVICE_THEME.source, NOT_SERVICE.source]),
    db.q(quoteSql(serviceWhere("$8", "$9")), [...base, focus.id, from, to, 6, SERVICE_THEME.source, NOT_SERVICE.source]),
  ]);

  // ---- competitive: every brand on the same measures, now and before
  const compRows = await db.q(
    `with posts_w as (
       select p.brand_id, count(*) filter (where ${inDays("p.posted_at", "$4", "$5")})::int as posts, count(*) filter (where ${inDays("p.posted_at", "$6", "$7")})::int as posts_prev,
              coalesce(sum(p.views) filter (where ${inDays("p.posted_at", "$4", "$5")}), 0)::float8 as views
       from posts p where p.workspace_id = $1 and p.relevant is not false ${platP} group by 1),
     comments_w as (
       select p.brand_id, count(*) filter (where ${inDays("c.posted_at", "$4", "$5")})::int as comments,
              count(*) filter (where c.sentiment = 'negative' and ${inDays("c.posted_at", "$4", "$5")})::int as negative,
              count(c.sentiment) filter (where ${inDays("c.posted_at", "$4", "$5")})::int as labelled,
              count(*) filter (where c.sentiment = 'negative' and ${inDays("c.posted_at", "$6", "$7")})::int as negative_prev,
              count(c.sentiment) filter (where ${inDays("c.posted_at", "$6", "$7")})::int as labelled_prev,
              avg(c.csat) filter (where ${inDays("c.posted_at", "$4", "$5")})::float8 as csat,
              count(*) filter (where c.purchase_intent and ${inDays("c.posted_at", "$4", "$5")})::int as intent
       from ${onBrandComments} group by 1)
     select b.id, b.name, coalesce(pw.posts, 0) as posts, coalesce(pw.posts_prev, 0) as posts_prev, coalesce(pw.views, 0) as views,
            coalesce(cw.comments, 0) as comments, coalesce(cw.negative, 0) as negative, coalesce(cw.labelled, 0) as labelled,
            coalesce(cw.negative_prev, 0) as negative_prev, coalesce(cw.labelled_prev, 0) as labelled_prev, cw.csat, coalesce(cw.intent, 0) as intent
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
      neg_pct: share(n(r.negative), n(r.labelled)), neg_pct_prev: share(n(r.negative_prev), n(r.labelled_prev)), csat: r.csat == null ? null : Math.round(Number(r.csat) * 100) / 100,
      intent_pct: share(n(r.intent), n(r.comments)), top_issue: top,
    };
  }).filter((b) => b.posts > 0 || b.comments > 0 || b.is_focus).sort((a, b) => b.posts - a.posts);

  // ---- data health
  const covRows = await db.q(
    `select p.platform, to_char(min(p.posted_at at time zone $2), 'YYYY-MM-DD') as first, to_char(max(p.posted_at at time zone $2), 'YYYY-MM-DD') as last, count(*)::int as posts,
            count(*) filter (where p.relevant = false)::int as off_topic, coalesce(sum(p.comments_count), 0)::float8 as reported,
            (select count(*) from comments c where c.workspace_id = $1 and c.platform = p.platform)::int as comments
     from posts p where p.workspace_id = $1 group by 1 order by posts desc`,
    [ws, tz],
  );
  const coverage: Coverage[] = covRows.map((r) => ({ platform: String(r.platform), first: String(r.first), last: String(r.last), posts: n(r.posts), off_topic: n(r.off_topic), comments: n(r.comments), reported_comments: n(r.reported) }));
  const notes: string[] = [];
  if (to === settled && settled < asOf) notes.push(`Comments for ${dayMonth(addDays(settled, 1))}${addDays(settled, 1) < asOf ? ` to ${dayMonth(asOf)}` : ""} are still arriving (half of a post's comments come in its first 15 hours), so this view ends on ${dayMonth(settled)}.`);
  else if (to > settled) notes.push(`Comments for ${dayMonth(addDays(settled, 1))} to ${dayMonth(to)} are still arriving (half of a post's comments come in its first 15 hours); those days will grow.`);
  for (const c of coverage) if (c.first > prevFrom) notes.push(`${PLATFORM_LABEL[c.platform] ?? c.platform} has been tracked since ${dayMonth(c.first)}, so comparisons with the previous ${f.days} days include it on one side only.`);
  const weekly = await db.q<{ wk: string; posts: number }>(
    `select to_char(date_trunc('week', p.posted_at at time zone $2), 'YYYY-MM-DD') as wk, count(*)::int as posts from posts p where p.workspace_id = $1 and p.posted_at >= (($3::date - 63)::timestamp at time zone $2) group by 1 order by 1`,
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
  status.reason = !d || d.comments < alert.min_comments
    ? `Not enough comments about ${focus.name} on ${dayMonth(d?.d ?? asOf)} to judge (${d?.comments ?? 0}; the rule needs ${alert.min_comments}).`
    : status.baseline.neg_pct == null
      ? `${d.neg_pct}% of ${d.comments.toLocaleString("en-US")} comments about ${focus.name} were negative on ${dayMonth(d.d)}; there is not yet ${alert.baseline_days} days of history to compare with.`
      : `${d.neg_pct}% of ${d.comments.toLocaleString("en-US")} comments about ${focus.name} were negative on ${dayMonth(d.d)}, against a ${alert.baseline_days}-day norm of ${status.baseline.neg_pct}%${status.multiple != null ? ` (${status.multiple}×)` : ""}.${lvl === "recovering" ? " Calm again after an issue in the last week." : ""}`;

  return {
    as_of: asOf, settled, tz, focus: { id: focus.id, name: focus.name, is_client: focus.id === client }, brands: brands.map((b) => ({ id: b.id, name: b.name })), platforms,
    filters: { ...f, from, to, prev_from: prevFrom, prev_to: prevTo },
    status, kpis, issues, rising, narratives, amplifiers, own, own_worst: ownWorst,
    service: { total: n(serviceCount?.n), quotes: serviceQuotes.map(toQuote) },
    competitive, coverage, off_topic_posts: coverage.reduce((a, c) => a + c.off_topic, 0), notes,
  };
}
