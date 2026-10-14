/**
 * The period a deck reports on: a week (Monday to Sunday) or a calendar month,
 * in the workspace's time zone (Decks, DECISIONS 2 Oct 2026). The weekly
 * competitor report is the week grain; a deck can also run month on month. The
 * words that name the period ("this week", "last month", "8-week range") come
 * from here so the slides, the fact sheet and the narrative say the same thing.
 */
import { latestCompleteWeek, monthOf, parsePeriod, shiftPeriod, weekOf, type Grain, type Period } from "../dashboard/period";
import { addDays, isoWeek, weekStart } from "./weeks";

export type { Grain, Period };
export const GRAINS: Grain[] = ["week", "month"];
/** A deck may also go day by day (PR decks, for a case that moves by the hour). */
export type DeckGrain = Grain | "day";
export const DECK_GRAINS: DeckGrain[] = ["day", "week", "month"];

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (d: string) => `${Number(d.slice(8, 10))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;

/** A range of days a person picked ("2026-10-06..2026-10-07"): for a deck about a case, not a calendar period. */
export const RANGE_RE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
export const MAX_RANGE_DAYS = 92;
export const isRange = (p: Pick<Period, "key">) => RANGE_RE.test(p.key);

export function rangePeriod(from: string, to: string): Period {
  if (to < from) [from, to] = [to, from];
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error(`pick at most ${MAX_RANGE_DAYS} days`);
  const label = from === to ? `${dm(from)} ${from.slice(0, 4)}` : from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8, 10))}–${dm(to)} ${to.slice(0, 4)}` : `${dm(from)} – ${dm(to)} ${to.slice(0, 4)}`;
  // grain is only nominal here: a range never steps by weeks or months (previousPeriod does the arithmetic)
  return { key: `${from}..${to}`, grain: "week", from, to, label, short: from === to ? dm(from) : `${dm(from)}–${dm(to)}` };
}

/**
 * A run of whole months a person picked ("2026-07..2026-09"): a monthly deck over the last three months, against
 * the three before (Refal, 14 Oct 2026). Grain stays month; the report buckets its history in runs of the same length.
 */
export const MONTHS_RE = /^(\d{4})-(\d{2})\.\.(\d{4})-(\d{2})$/;
export const MAX_RUN_MONTHS = 6;
const monthIndex = (y: number, m: number) => y * 12 + (m - 1);

export function monthRun(from: string, to: string): Period {
  const [fy, fm] = from.split("-").map(Number), [ty, tm] = to.split("-").map(Number);
  let a = monthIndex(fy, fm), b = monthIndex(ty, tm);
  if (b < a) [a, b] = [b, a];
  const n = b - a + 1;
  if (n > MAX_RUN_MONTHS) throw new Error(`pick at most ${MAX_RUN_MONTHS} months`);
  const ym = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  const first = parsePeriod(ym(a))!, last = parsePeriod(ym(b))!;
  if (n === 1) return first;
  const sameYear = Math.floor(a / 12) === Math.floor(b / 12);
  const label = sameYear ? `${SHORT[a % 12]}–${SHORT[b % 12]} ${Math.floor(b / 12)}` : `${SHORT[a % 12]} ${Math.floor(a / 12)} – ${SHORT[b % 12]} ${Math.floor(b / 12)}`;
  return { key: `${ym(a)}..${ym(b)}`, grain: "month", from: first.from, to: last.to, label, short: `${SHORT[a % 12]}–${SHORT[b % 12]}` };
}
export const isMonthRun = (p: Pick<Period, "key">) => MONTHS_RE.test(p.key);
/**
 * SQL for the first day of the run of n months a timestamp falls in, runs counted from the anchor month (YYYY-MM-DD):
 * with anchor July and n = 3, a May post lands in April (Apr–Jun), a September post in July. Integers only, never input.
 */
export function monthRunBucketSql(col: string, tzParam: string, anchor: string, n: number): string {
  const [y, m] = anchor.split("-").map(Number);
  if (![y, m, n].every(Number.isInteger) || n < 1) throw new Error(`bad run of months: ${anchor} × ${n}`);
  const t = `date_trunc('month', ${col} at time zone ${tzParam})`;
  return `(make_date(${y}, ${m}, 1) + make_interval(months => (floor(((extract(year from ${t})::int * 12 + extract(month from ${t})::int) - ${y * 12 + m})::numeric / ${n}) * ${n})::int))::date`;
}
/** how many months a period spans: the run's length, else 1 */
export function monthsIn(p: Pick<Period, "key">): number {
  const m = MONTHS_RE.exec(p.key);
  return m ? monthIndex(Number(m[3]), Number(m[4])) - monthIndex(Number(m[1]), Number(m[2])) + 1 : 1;
}
/** "the last 3 months" ending with the latest complete month: what a monthly deck offers beside single months */
export function lastMonths(latest: Period, n: number): Period {
  const [y, m] = latest.from.split("-").map(Number);
  const i = monthIndex(y, m) - (n - 1);
  return monthRun(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, latest.key);
}
/** One day ("2026-10-07"): a daily deck's period. */
export function dayPeriod(d: string): Period {
  return { ...rangePeriod(d, d), key: d };
}
export const isDay = (p: Pick<Period, "key">) => /^\d{4}-\d{2}-\d{2}$/.test(p.key);

/** The period just before: the day, week or month before, or as many days right before a range. */
export function previousPeriod(p: Period): Period {
  if (isDay(p)) return dayPeriod(addDays(p.from, -1));
  if (isMonthRun(p)) {
    const n = monthsIn(p);
    return monthRun(shiftPeriod(parsePeriod(p.from.slice(0, 7))!, -n).key, shiftPeriod(parsePeriod(p.to.slice(0, 7))!, -n).key);
  }
  if (!isRange(p)) return shiftPeriod(p, -1);
  const days = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1;
  return rangePeriod(addDays(p.from, -days), addDays(p.from, -1));
}

/** "2026-W26" or any day in it for a week; "2026-06" or any day in it for a month; "YYYY-MM-DD..YYYY-MM-DD" for chosen days. */
export function deckPeriod(grain: DeckGrain, raw: string): Period {
  const r = RANGE_RE.exec(raw);
  if (r) return rangePeriod(r[1], r[2]);
  if (grain === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`a day must be YYYY-MM-DD, got ${raw}`);
    return dayPeriod(raw);
  }
  if (grain === "week") return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekOf(raw) : parsePeriod(isoWeek(weekStart(raw)))!;
  const run = MONTHS_RE.exec(raw);
  if (run) return monthRun(`${run[1]}-${run[2]}`, `${run[3]}-${run[4]}`);
  const m = /^(\d{4})-(\d{2})(-\d{2})?$/.exec(raw);
  const p = m ? parsePeriod(`${m[1]}-${m[2]}`) : null;
  if (!p) throw new Error(`month must be YYYY-MM, got ${raw}`);
  return p;
}

/** The first day of the period n steps away (negative = earlier). */
export function stepFrom(grain: Grain, from: string, n: number): string {
  return shiftPeriod(deckPeriod(grain, from), n).from;
}

/** The day after the period ends: the exclusive bound queries use. */
export const nextStart = (p: Period) => addDays(p.to, 1);

/** The latest period the data fully covers: the week before unless `asOf` is a Sunday; the month before unless `asOf` is its last day. */
export function latestComplete(grain: DeckGrain, asOf: string): Period {
  // a day is complete once the data has moved past it
  if (grain === "day") return dayPeriod(addDays(asOf.slice(0, 10), -1));
  if (grain === "week") return weekOf(latestCompleteWeek(asOf));
  const m = monthOf(asOf);
  return m.to === asOf ? m : shiftPeriod(m, -1);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The label under a bar of a period series: "22 Jun" for a week (its Monday), "Jun" for a month, "Jul–Sep" for a run of months. */
export function seriesLabel(grain: Grain | undefined, from: string, months = 1): string {
  const d = new Date(from.slice(0, 10) + "T00:00:00Z");
  if (grain === "month" && months > 1) return `${SHORT_MONTHS[d.getUTCMonth()]}–${SHORT_MONTHS[(d.getUTCMonth() + months - 1) % 12]}`;
  return grain === "month" ? SHORT_MONTHS[d.getUTCMonth()] : `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

export type PeriodWords = {
  /** "week", "month", "quarter" (a run of three months) or "6-month period" */
  unit: string;
  /** "this week" / "this month" */
  this: string;
  last: string;
  /** "8-week" for a lookback of 8 */
  span: (n: number) => string;
  /** "weekly" / "monthly" */
  adj: string;
  /** "WoW" / "MoM" */
  over: string;
};

export function periodWords(grain?: Grain, months = 1): PeriodWords {
  if (grain === "month" && months > 1) {
    // three months read as a quarter, wherever they start; any other run is named by its length
    if (months === 3) return { unit: "quarter", this: "this quarter", last: "last quarter", span: (n) => `${n}-quarter`, adj: "quarterly", over: "QoQ" };
    return { unit: `${months}-month period`, this: `these ${months} months`, last: `the ${months} months before`, span: (n) => `${n}-period`, adj: `${months}-monthly`, over: `vs the ${months} months before` };
  }
  const unit = grain === "month" ? "month" : "week";
  return { unit, this: `this ${unit}`, last: `last ${unit}`, span: (n) => `${n}-${unit}`, adj: `${unit}ly`, over: unit === "month" ? "MoM" : "WoW" };
}
