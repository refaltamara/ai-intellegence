"use client";
/**
 * The period a deck version covers: one of the weeks or months the data covers, or, for PR
 * decks, days picked by hand ("YYYY-MM-DD..YYYY-MM-DD"): a case moves faster than a week.
 * A day by day deck also takes any one day the data covers, from a calendar ("YYYY-MM-DD").
 */
import { useState } from "react";

const DAY = "day";
const RANGE = "range";
const isDayKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

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
  const [from, setFrom] = useState(mode === RANGE ? value.split("..")[0] : range?.asOf ?? "");
  const [to, setTo] = useState(mode === RANGE ? value.split("..")[1] : range?.asOf ?? "");
  const set = (f: string, t: string) => onChange(f && t ? `${f <= t ? f : t}..${f <= t ? t : f}` : "");
  const pick = (v: string) => {
    if (v === RANGE) { setMode(RANGE); set(from, to); }
    else if (v === DAY) { setMode(DAY); onChange(one); }
    else { setMode("list"); onChange(v); }
  };
  const bounds = { min: range?.first, max: range?.asOf };
  return (
    <span className="periodpick">
      <select value={mode === "list" ? value : mode} onChange={(e) => pick(e.target.value)}>
        {periods.map((p) => <option key={p.key} value={p.key}>{p.label}{replaced?.(p.key) ? " (replace)" : ""}</option>)}
        {range && day && <option value={DAY}>Pick a day…</option>}
        {range && <option value={RANGE}>Choose dates…</option>}
      </select>
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
        </span>
      )}
    </span>
  );
}
