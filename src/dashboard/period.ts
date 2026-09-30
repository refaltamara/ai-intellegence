/**
 * The dashboard's periods: a calendar month ("2026-06") or an ISO week
 * ("2026-W26", Monday to Sunday), always in the workspace's time zone. Every
 * number on the dashboard compares a period with the one before it. Pure.
 */
import { addDays, isoWeek, weekLabel, weekStart } from "../competitor/weeks";

export type Grain = "month" | "week";
export type Period = { key: string; grain: Grain; from: string; to: string; label: string; short: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthPeriod(year: number, month: number): Period {
  // month is 1-based; normalise overflow either way
  const d = new Date(Date.UTC(year, month - 1, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const from = d.toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`, grain: "month", from, to, label: `${MONTHS[m]} ${y}`, short: MONTHS[m].slice(0, 3) };
}

function weekPeriod(monday: string): Period {
  const key = isoWeek(monday);
  return { key, grain: "week", from: monday, to: addDays(monday, 6), label: weekLabel(monday), short: key.slice(5) };
}

/** "2026-06" or "2026-W26" → the period; anything else → null */
export function parsePeriod(key: string | null | undefined): Period | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? monthPeriod(Number(m[1]), month) : null;
  }
  if (/^\d{4}-W\d{2}$/.test(key)) {
    const week = Number(key.slice(6));
    if (week < 1 || week > 53) return null;
    const monday = weekStart(key);
    return isoWeek(monday) === key ? weekPeriod(monday) : null;
  }
  return null;
}

/** The period n steps away (negative = earlier). */
export function shiftPeriod(p: Period, n: number): Period {
  if (p.grain === "week") return weekPeriod(addDays(p.from, 7 * n));
  const [y, m] = p.from.split("-").map(Number);
  return monthPeriod(y, m + n);
}

/** The month that holds a day. */
export function monthOf(day: string): Period {
  const [y, m] = day.split("-").map(Number);
  return monthPeriod(y, m);
}

/** The ISO week that holds a day. */
export function weekOf(day: string): Period {
  const d = new Date(day + "T00:00:00Z");
  return weekPeriod(addDays(day, -((d.getUTCDay() + 6) % 7)));
}

/** What the period picker offers: every month with data, newest first, and the last `weeks` weeks. */
export function periodOptions(earliest: string, asOf: string, weeks = 12): { months: Period[]; weeks: Period[] } {
  const months: Period[] = [];
  for (let p = monthOf(asOf); p.to >= earliest && months.length < 36; p = shiftPeriod(p, -1)) months.push(p);
  const ws: Period[] = [];
  for (let p = weekOf(asOf); p.to >= earliest && ws.length < weeks; p = shiftPeriod(p, -1)) ws.push(p);
  return { months, weeks: ws };
}

/** How many days of a period the data reaches: a period still running, or the first one loaded, is partial. */
export function daysCovered(p: Period, earliest: string, asOf: string): { days: number; of: number } {
  const span = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
  const from = p.from < earliest ? earliest : p.from;
  const to = p.to > asOf ? asOf : p.to;
  return { days: to < from ? 0 : span(from, to), of: span(p.from, p.to) };
}

/** The Monday of the latest week the data fully covers: the week of `asOf` when it is a Sunday, else the week before. */
export function latestCompleteWeek(asOf: string): string {
  const d = new Date(asOf + "T00:00:00Z");
  const monday = addDays(asOf, -((d.getUTCDay() + 6) % 7));
  return d.getUTCDay() === 0 ? monday : addDays(monday, -7);
}

/** How a card saves the period being looked at: "latest-month" / "latest-week" when it is the newest one, so it keeps moving; otherwise the period itself. */
export function periodSetting(p: Period, asOf: string): string {
  if (p.key === monthOf(asOf).key) return "latest-month";
  if (p.key === weekOf(latestCompleteWeek(asOf)).key) return "latest-week";
  return p.key;
}
