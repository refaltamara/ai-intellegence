/**
 * "Why this level?" (CMS plan, The Builder): the status ladder replayed over the last 90
 * settled days, under the team's rule and under a rule someone is trying, so a Builder sees
 * what a new threshold would have called before applying it. Every count comes from SQL
 * and the same ladder() the dashboard uses; nothing here is the model's.
 */
import type { RoleModel } from "../roles/model";
import { PR } from "../roles/model";
import { sanitize } from "../roles/policy";
import { SkillDb } from "../skills/db";
import { ladder, ruleText, settledDay, workspaceBasics, type Level } from "./dashboard";

type Alert = NonNullable<RoleModel["alert"]>;
export type ReplayDay = { d: string; comments: number; negative: number; now: Level; next: Level };
export type Replay = {
  focus: { id: string; name: string };
  from: string;
  to: string;
  days: ReplayDay[];
  counts: { now: Record<Level, number>; next: Record<Level, number> };
  /** days whose level differs, newest first */
  changed: ReplayDay[];
  rule: { now: string; next: string };
  alert: { now: Alert; next: Alert };
};

const n = (v: unknown) => Number(v ?? 0);
const LEVELS: Level[] = ["calm", "watch", "issue", "crisis", "recovering"];

/** The trial rule: the team's rule with the tried fields, each kept only inside its guard rails. */
export function trialAlert(role: RoleModel, tried: Partial<Alert>): Alert {
  const base = role.alert ?? PR.alert!;
  const changes = Object.fromEntries(Object.entries(tried).filter(([, v]) => v != null).map(([k, v]) => [`alert.${k}`, v]));
  const kept = sanitize(changes, "company", role);
  const next: Alert = { ...base };
  for (const [k, v] of Object.entries(kept)) (next as Record<string, unknown>)[k.slice("alert.".length)] = v;
  if (next.crisis_multiple != null && next.crisis_multiple < next.negative_multiple * 1.25) delete next.crisis_multiple;
  return next;
}

export async function ladderReplay(ws: string, role: RoleModel, focusId: string | null, tried: Partial<Alert>, span = 90): Promise<Replay | null> {
  const db = new SkillDb();
  const basics = await workspaceBasics(db, ws);
  if (!basics) return null;
  const focus = basics.brands.find((b) => b.id === focusId) ?? basics.brands.find((b) => b.id === basics.client) ?? basics.brands[0];
  const now = role.alert ?? PR.alert!;
  const next = trialAlert(role, tried);
  const to = await settledDay(db, ws, basics.tz, basics.asOf, now);
  const lookback = span + Math.max(now.baseline_days, next.baseline_days) + 8;
  const daily = await db.q<{ d: string; comments: number; negative: number }>(
    `with days as (select generate_series($3::date - ($4::int - 1), $3::date, interval '1 day')::date as d)
     select to_char(days.d, 'YYYY-MM-DD') as d, count(c.id)::int as comments, count(c.id) filter (where c.sentiment = 'negative')::int as negative
     from days left join (
       select c.id, c.sentiment, (c.posted_at at time zone $2)::date as day
       from comments c join posts p on p.id = c.post_id
       where c.workspace_id = $1 and p.relevant is not false and p.brought_in_by = 'panel' and c.sentiment_source is distinct from 'subject' and c.posted_at is not null and p.brand_id = $5
     ) c on c.day = days.d
     group by days.d order by days.d`,
    [ws, basics.tz, to, lookback, focus.id],
  );
  const withBase = (a: Alert) => daily.map((x, i) => {
    const prior = daily.slice(Math.max(0, i - a.baseline_days), i);
    const pc = prior.reduce((s, r) => s + n(r.comments), 0);
    const pn = prior.reduce((s, r) => s + n(r.negative), 0);
    return { d: x.d, comments: n(x.comments), negative: n(x.negative), baseline_pct: prior.length >= 7 && pc >= a.min_comments ? (pn / pc) * 100 : null };
  });
  const a = ladder(withBase(now), now).slice(-span);
  const b = ladder(withBase(next), next).slice(-span);
  const days: ReplayDay[] = a.map((x, i) => ({ d: x.d, comments: x.comments, negative: x.negative, now: x.level, next: b[i]?.level ?? x.level }));
  const count = (k: "now" | "next") => Object.fromEntries(LEVELS.map((l) => [l, days.filter((x) => x[k] === l).length])) as Record<Level, number>;
  return {
    focus: { id: focus.id, name: focus.name },
    from: days[0]?.d ?? to,
    to,
    days,
    counts: { now: count("now"), next: count("next") },
    changed: days.filter((x) => x.now !== x.next).reverse(),
    rule: { now: ruleText(now, focus.name), next: ruleText(next, focus.name) },
    alert: { now, next },
  };
}
