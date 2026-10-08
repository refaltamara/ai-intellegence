"use client";
/**
 * The period a deck version covers: one of the weeks or months the data covers, or, for PR
 * decks, days picked by hand ("YYYY-MM-DD..YYYY-MM-DD"): a case moves faster than a week.
 * A day by day deck also takes any one day the data covers, from a calendar ("YYYY-MM-DD").
 * Where chosen dates are allowed, the two ways are buttons side by side, so a run of days
 * (6 to 8 Oct) is one click away, not the last line of a list.
 */
import { useState } from "react";

const DAY = "day";
const RANGE = "range";
const isDayKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** a day moved by n days, as YYYY-MM-DD (UTC, so no clock shifts it) */
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysIn = (f: string, t: string) => Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86_400_000) + 1;

export function PeriodPick({ periods, value, onChange, range, day, replaced }: {
  periods: { key: string; label: string }[];
  value: string;
  onChange: (period: string) => void;
  /** chosen days are offered when this is set; first and asOf are the days the data starts and ends */
  range?: { asOf: string; first?: string } | null;
  /** a day by day deck: offer any one day from a calendar */
  day?: boolean;
  replaced?: (key: string) => boolean;
}) {
  const [mode, setMode] = useState<"list" | typeof DAY | typeof RANGE>(/\.\./.test(value) ? RANGE : day && isDayKey(value) && !periods.some((p) => p.key === value) ? DAY : "list");
  const [one, setOne] = useState(isDayKey(value) ? value : periods[0]?.key && isDayKey(periods[0].key) ? periods[0].key : range?.asOf ?? "");
  // a run of days starts as the last three the data covers (a week for a weekly deck), never before the first
  const start = (span: number) => (range && isDayKey(range.asOf) ? (range.first && shift(range.asOf, -span) < range.first ? range.first : shift(range.asOf, -span)) : "");
  const [from, setFrom] = useState(mode === RANGE ? value.split("..")[0] : start(day ? 2 : 6));
  const [to, setTo] = useState(mode === RANGE ? value.split("..")[1] : range?.asOf ?? "");
  const set = (f: string, t: string) => onChange(f && t ? `${f <= t ? f : t}..${f <= t ? t : f}` : "");
  const toList = () => { if (mode === RANGE) { setMode(day && !periods.some((p) => p.key === one) ? DAY : "list"); onChange(day ? one : periods[0]?.key ?? ""); } };
  const toRange = () => { if (mode !== RANGE) { setMode(RANGE); set(from, to); } };
  const pick = (v: string) => {
    if (v === DAY) { setMode(DAY); onChange(one); }
    else { setMode("list"); onChange(v); if (isDayKey(v)) setOne(v); }
  };
  const bounds = { min: range?.first, max: range?.asOf };
  const unit = day ? "day" : /W\d/.test(periods[0]?.key ?? "") ? "week" : "month";
  const n = from && to ? Math.abs(daysIn(from <= to ? from : to, from <= to ? to : from)) : 0;
  return (
    <span className="periodpick">
      {range && (
        <span className="seg sm" role="group" aria-label="How many days">
          <button type="button" className={mode !== RANGE ? "on" : ""} onClick={toList}>{day ? "One day" : `One ${unit}`}</button>
          <button type="button" className={mode === RANGE ? "on" : ""} onClick={toRange}>{day ? "Several days" : "Chosen dates"}</button>
        </span>
      )}
      {mode !== RANGE && (
        <select value={mode === "list" ? value : mode} onChange={(e) => pick(e.target.value)} aria-label={day ? "Day" : unit === "week" ? "Week" : "Month"}>
          {periods.map((p) => <option key={p.key} value={p.key}>{p.label}{replaced?.(p.key) ? " (replace)" : ""}</option>)}
          {range && day && <option value={DAY}>Another day…</option>}
        </select>
      )}
      {range && mode === DAY && (
        <span className="dates">
          <input type="date" value={one} {...bounds} onChange={(e) => { setOne(e.target.value); onChange(e.target.value); }} aria-label="Day" />
          {replaced?.(one) && <span>(replace)</span>}
        </span>
      )}
      {range && mode === RANGE && (
        <span className="dates">
          <input type="date" value={from} {...bounds} onChange={(e) => { setFrom(e.target.value); set(e.target.value, to); }} aria-label="From" />
          <span>to</span>
          <input type="date" value={to} {...bounds} onChange={(e) => { setTo(e.target.value); set(from, e.target.value); }} aria-label="To" />
          {n > 0 && <span>{n} day{n === 1 ? "" : "s"}{day && n > 1 ? ", day by day" : ""}</span>}
        </span>
      )}
    </span>
  );
}
