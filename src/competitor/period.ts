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

/** "2026-W26" or any day in it for a week; "2026-06" or any day in it for a month. */
export function deckPeriod(grain: Grain, raw: string): Period {
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
export function latestComplete(grain: Grain, asOf: string): Period {
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
