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

/** One day ("2026-10-07"): a daily deck's period. */
export function dayPeriod(d: string): Period {
  return { ...rangePeriod(d, d), key: d };
}
export const isDay = (p: Pick<Period, "key">) => /^\d{4}-\d{2}-\d{2}$/.test(p.key);

/** The period just before: the day, week or month before, or as many days right before a range. */
export function previousPeriod(p: Period): Period {
  if (isDay(p)) return dayPeriod(addDays(p.from, -1));
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

/** The label under a bar of a period series: "22 Jun" for a week (its Monday), "Jun" for a month. */
export function seriesLabel(grain: Grain | undefined, from: string): string {
  const d = new Date(from.slice(0, 10) + "T00:00:00Z");
  return grain === "month" ? SHORT_MONTHS[d.getUTCMonth()] : `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

export type PeriodWords = {
  unit: "week" | "month";
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

export function periodWords(grain?: Grain): PeriodWords {
  const unit = grain === "month" ? "month" : "week";
  return { unit, this: `this ${unit}`, last: `last ${unit}`, span: (n) => `${n}-${unit}`, adj: `${unit}ly`, over: unit === "month" ? "MoM" : "WoW" };
}
