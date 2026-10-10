/**
 * "Ask why" (DECISIONS, 30 Sep 2026): a number on the dashboard becomes the start
 * of a chat. The link carries only a reference (what was clicked and the
 * filters), never the numbers; the server re-reads the figures from the same
 * queries as the dashboard, shows them as a card at the top of the chat, and
 * hands them to CeMO with the question. A tampered or stale link resolves to
 * nothing and the chat starts plain.
 */
import { change as changeText, compact, int, pct, pts } from "../competitor/view";
import { TIER_BANDS } from "../config/thresholds";
import { SkillDb } from "../skills/db";
import { loadContext, type Context } from "../skills/params";
import type { AskContext, AskRef, Fact, PlatformFilter } from "./askref";
import { PLATFORM_NAME } from "./askref";
import { brandHandles, buckets, content, filterQuery, Params, rankings, tiers, topCreators, totals, type Filters } from "./data";
import { parsePeriod, shiftPeriod, weekOf, type Period } from "./period";
import { resolvePulseAsk } from "../pulse/ask";

const PLATFORM_LABEL: Record<PlatformFilter, string> = { all: "All platforms", tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
const METRIC_LABEL = { posts: "content", views: "views (day 7)", engagements: "engagement", er: "engagement rate" } as const;

const up = (n: number | null | undefined) => (n == null ? "moved" : n >= 0 ? "rise" : "fall");
const changeOr = (now: number, prev: number | null | undefined) => (prev == null ? "no earlier period" : changeText(now, prev));

/** Re-read the figures behind a dashboard click. Null when the reference points at nothing in this workspace. */
export async function resolveAsk(workspaceId: string, ref: AskRef): Promise<AskContext | null> {
  // a case's Pulse has its own figures and no filters
  if (ref.k === "pulse") return resolvePulseAsk(workspaceId, ref.card);
  const db = new SkillDb();
  const ctx = await loadContext(db, workspaceId);
  const period = parsePeriod(ref.period)!;
  const known = new Set(ctx.brands.map((b) => b.id));
  const f: Filters = { platform: ref.platform, brands: ref.brands.filter((b) => known.has(b)), period };
  const prev = shiftPeriod(period, -1);
  const names = new Map(ctx.brands.map((b) => [b.id, { name: b.name, is_client: b.is_client }]));
  const nameOf = (id: string) => names.get(id)?.name ?? id;
  const scopeLine = [PLATFORM_LABEL[f.platform], period.label, f.brands.length ? f.brands.map(nameOf).join(", ") : "all brands"].join(" · ");
  const back = `/dashboard?${filterQuery(f)}`;
  const make = (title: string, facts: Fact[], question: string): AskContext => ({ source: "dashboard", title, scope: scopeLine, facts, back, question });

  switch (ref.k) {
    case "kpi": {
      const [k, { rows, periods }] = await Promise.all([totals(db, ctx, f, prev), buckets(db, ctx, f)]);
      const metric = ref.metric;
      const now = k.now[metric];
      const before = k.prev[metric];
      const facts: Fact[] = metric === "er"
        ? [{ label: `Engagement rate, ${period.label}`, value: pct(now as number | null, 2) }, { label: prev.label, value: pct(before as number | null, 2) }, { label: "Change", value: pts(now as number | null, before as number | null, 2) }]
        : [{ label: `Total ${METRIC_LABEL[metric]}, ${period.label}`, value: metric === "posts" ? int(now as number) : compact(now as number) }, { label: prev.label, value: metric === "posts" ? int(before as number) : compact(before as number) }, { label: "Change", value: changeOr(now as number, before as number) }];
      if (metric === "views") {
        facts.push({ label: "Views (latest)", value: compact(k.now.views_latest) });
        if (k.now.so_far) facts.push({ label: "So far", value: `${int(k.now.so_far)} of ${int(k.now.posts)} posts are under 7 days old and count their latest reading so far` });
      }
      if (metric === "posts" || metric === "views") {
        const ranked = rankings(rows, periods, f, names).filter((r) => r.prev);
        const key = metric;
        const moves = ranked.map((r) => ({ name: r.name, d: r[key] - (r.prev?.[key] ?? 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
        if (moves.length) facts.push({ label: "Biggest brand moves", value: moves.map((m) => `${m.name} ${m.d >= 0 ? "+" : "−"}${compact(Math.abs(m.d))}`).join(", ") });
      }
      const d = k.change[metric]?.pct;
      return make(metric === "er" ? "Engagement rate" : `Total ${METRIC_LABEL[metric]}`, facts, metric === "er"
        ? `Why did the engagement rate ${up(d)} in ${period.label} compared with ${prev.label}?`
        : `Why did total ${METRIC_LABEL[metric]} ${up(d)} ${d == null ? "" : `${Math.abs(Math.round(d))}% `}in ${period.label} compared with ${prev.label}? Which brands drove it?`);
    }
    case "brand": {
      if (!known.has(ref.brand)) return null;
      const { rows, periods } = await buckets(db, ctx, f);
      const row = rankings(rows, periods, { ...f, brands: [ref.brand] }, names)[0];
      if (!row) return null;
      const facts: Fact[] = [
        { label: `Share of views (day 7), ${period.label}`, value: pct(row.share_views, 1) },
        { label: "Share of voice (posts)", value: pct(row.share_voice, 1) },
        { label: "Share of engagement", value: pct(row.share_eng, 1) },
        { label: "Views (day 7)", value: `${compact(row.views)} (${row.prev ? changeOr(row.views, row.prev.views) : "no earlier period"}); latest ${compact(row.views_latest)}${row.so_far ? `; ${int(row.so_far)} posts under 7 days old count so far` : ""}` },
        { label: "Content", value: `${int(row.posts)} (${row.prev ? changeOr(row.posts, row.prev.posts) : "no earlier period"})` },
        { label: "Creators", value: int(row.creators) },
        { label: "Engagement rate", value: pct(row.er, 2) },
      ];
      for (const fl of row.flags) facts.push({ label: "Unusual", value: `${PLATFORM_NAME[fl.platform] ?? fl.platform} ${fl.metric === "er" ? "engagement rate" : fl.metric === "posts" ? "share of content" : "share of views"} ${fl.direction} ${fl.metric === "er" ? `${Math.abs(fl.change).toFixed(1)} pt` : `${Math.abs(Math.round(fl.change))}%`} vs ${prev.label}, outside its own range` });
      const lead = row.flags[0];
      const d = row.views_change?.pct;
      const question = lead
        ? `Why is ${row.name}'s ${PLATFORM_NAME[lead.platform] ?? lead.platform} ${lead.metric === "er" ? "engagement rate" : lead.metric === "posts" ? "content" : "views"} ${lead.direction === "up" ? "up" : "down"} so sharply in ${period.label}? What's driving it?`
        : `Why did ${row.name}'s views ${up(d)} ${d == null ? "" : `${Math.abs(Math.round(d))}% `}in ${period.label}? What's driving it?`;
      return make(row.name, facts, question);
    }
    case "tier": {
      const band = TIER_BANDS.find((b) => b.tier === ref.tier)!;
      const [cur, before] = await Promise.all([tiers(db, ctx, f), tiers(db, ctx, { ...f, period: prev })]);
      const t = cur.find((x) => x.tier === ref.tier)!;
      const p = before.find((x) => x.tier === ref.tier)!;
      return make(`${band.label} creators`, [
        { label: `Creators, ${period.label}`, value: `${int(t.creators)} (${pct(t.share_pct)} of creators; ${changeOr(t.creators, p.creators)} vs ${prev.label})` },
        { label: "Content", value: `${int(t.posts)} (${changeOr(t.posts, p.posts)})` },
        { label: "Views (day 7)", value: `${compact(t.views)} (${changeOr(t.views, p.views)})` },
        { label: "Engagement rate", value: pct(t.er, 2) },
      ], `What are ${band.label.toLowerCase()} creators doing in ${period.label}, which brands use them most, and what works?`);
    }
    case "week": {
      if (!known.has(ref.brand)) return null;
      const week = weekOf(ref.week);
      if (week.from !== ref.week) return null;
      const s = await brandWeeks(db, ctx, f, ref.brand, week);
      const cur = s[s.length - 1];
      const before = s.slice(0, -1);
      const avg = before.length ? before.reduce((a, x) => a + x.posts, 0) / before.length : null;
      const avgViews = before.length ? before.reduce((a, x) => a + x.views, 0) / before.length : null;
      return make(`${nameOf(ref.brand)}, week of ${week.label}`, [
        { label: "Content that week", value: `${int(cur.posts)} (${avg == null ? "no earlier weeks" : `${changeOr(cur.posts, avg)} vs its ${before.length}-week average of ${int(avg)}`})` },
        { label: "Views (day 7) that week", value: `${compact(cur.views)} (${avgViews == null ? "no earlier weeks" : `${changeOr(cur.views, avgViews)} vs average`})` },
        { label: "Creators", value: int(cur.creators) },
      ], `What happened with ${nameOf(ref.brand)} in the week of ${week.label}?`);
    }
    case "creator": {
      const handles = await brandHandles(db, workspaceId);
      const r = (await topCreators(db, ctx, f, handles, ref.creator, 1)).by_views[0];
      if (!r) return null;
      return make(`@${r.handle}`, [
        { label: `Content, ${period.label}`, value: int(r.posts) },
        { label: "Views (day 7)", value: compact(r.views) },
        { label: "Comments", value: int(r.comments) },
        { label: "Followers", value: r.followers == null ? "unknown" : compact(r.followers) },
        { label: "Posted for", value: r.brands.slice(0, 4).map(nameOf).join(", ") || "–" },
      ], `What has @${r.handle} been posting in ${period.label}, for which brands, and why does it perform?`);
    }
    case "post": {
      const { cards } = await content(ctx, f, { sort: "views", q: "", page: 0 }, ref.url);
      const c = cards[0];
      if (!c) return null;
      return make(`Post by ${c.handle ? `@${c.handle}` : "an unknown account"}`, [
        { label: c.so_far ? "Views so far (under 7 days old)" : "Views (day 7)", value: compact(c.views) },
        { label: "Views (latest)", value: compact(c.views_latest) },
        { label: "Engagement", value: c.engagements == null ? "–" : compact(c.engagements) },
        { label: "Engagement rate", value: pct(c.er, 2) },
        { label: "Brands", value: c.brands.map(nameOf).join(", ") },
        { label: "Posted", value: c.posted_at.slice(0, 10) },
        { label: "Link", value: c.url },
      ], `Why did this post${c.handle ? ` from @${c.handle}` : ""} perform the way it did, and what can we learn from it?`);
    }
  }
}

/** One brand's weekly content, views (day 7) and creators for the week asked about and up to four weeks before it (daily totals). */
async function brandWeeks(db: SkillDb, ctx: Context, f: Filters, brand: string, week: Period): Promise<{ week: string; posts: number; views: number; creators: number }[]> {
  const first = shiftPeriod(week, -4);
  const P = new Params();
  const platform = f.platform === "all" ? "" : ` and platform = ${P.add(f.platform)}`;
  const ws = P.add(ctx.workspaceId);
  const b = P.add(brand);
  const from = P.add(first.from);
  const to = P.add(week.to);
  const rows = await db.q<{ week: string; posts: number; views: number; creators: number }>(
    `with t as (
       select to_char(date_trunc('week', day), 'YYYY-MM-DD') as week, sum(posts)::int as posts, sum(d7_views)::float8 as views
         from daily_totals where workspace_id = ${ws} and brand_id = ${b} and day >= ${from}::date and day <= ${to}::date${platform} group by 1
     ), c as (
       select to_char(date_trunc('week', day), 'YYYY-MM-DD') as week, count(distinct creator_id)::int as creators
         from daily_creators where workspace_id = ${ws} and brand_id = ${b} and day >= ${from}::date and day <= ${to}::date${platform} group by 1
     )
     select t.*, coalesce(c.creators, 0)::int as creators from t left join c using (week)`,
    P.values,
  );
  const weeks = Array.from({ length: 5 }, (_, i) => shiftPeriod(week, i - 4).from);
  // weeks before the brand's first post are not a zero, they are not there
  const firstSeen = weeks.findIndex((w) => rows.some((r) => r.week === w));
  return weeks.slice(Math.max(0, Math.min(firstSeen, 4))).map((w) => {
    const r = rows.find((x) => x.week === w);
    return { week: w, posts: Number(r?.posts ?? 0), views: Number(r?.views ?? 0), creators: Number(r?.creators ?? 0) };
  });
}

/** What the model reads in front of the person's question. */
export function contextPreamble(c: AskContext): string {
  if (c.source === "slide" && c.slide) {
    const s = c.slide;
    return [
      `[The person is presenting slide ${s.n} of ${s.total} of the ${s.deck}, ${s.week.label} (compared with ${s.week.previous}), titled "${c.title}". Someone in the room may have asked them this question, so answer in a few sentences they can say out loud, with the numbers.`,
      `What the slide shows, computed from the data:\n${s.text}`,
      `Answer about this slide and its period (${s.week.from} to ${s.week.to}). Quote the report's numbers exactly. When the question needs more than the report holds (which creators, which posts, a brand's tier mix or products), run the analyses with window from ${s.week.from} to ${s.week.to} and the brands named, and cite the evidence.]`,
    ].join("\n\n");
  }
  if (c.source === "pulse") {
    return [
      `[The person opened this chat from the Pulse, the hour-by-hour view of the case, looking at: ${c.title} (${c.scope}).`,
      `Figures on their screen, computed from the data: ${c.facts.map((x) => `${x.label}: ${x.value}`).join("; ")}.`,
      "Answer their question about the case. Quote these figures exactly; when the question needs more (which comments, which accounts, which posts, a day or a platform), run the analyses and cite the evidence. Do not recompute these figures.]",
    ].join("\n");
  }
  return [
    `[The person opened this chat from the dashboard, looking at: ${c.title} (${c.scope}).`,
    `Figures on their screen, computed from the data: ${c.facts.map((x) => `${x.label}: ${x.value}`).join("; ")}.`,
    "Answer about exactly this. Use the analyses to find what is behind it and cite the evidence; do not recompute these figures.]",
  ].join("\n");
}
