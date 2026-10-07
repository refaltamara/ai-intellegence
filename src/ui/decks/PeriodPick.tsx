"use client";
/**
 * The period a deck version covers: one of the weeks or months the data covers, or, for PR
 * decks, days picked by hand ("YYYY-MM-DD..YYYY-MM-DD"): a case moves faster than a week.
 */
import { useState } from "react";

const RANGE = "range";

export function PeriodPick({ periods, value, onChange, range, replaced }: {
  periods: { key: string; label: string }[];
  value: string;
  onChange: (period: string) => void;
  /** chosen days are offered when this is set; asOf is the last day the data reaches */
  range?: { asOf: string } | null;
  replaced?: (key: string) => boolean;
}) {
  const isRange = /\.\./.test(value);
  const [from, setFrom] = useState(isRange ? value.split("..")[0] : range?.asOf ?? "");
  const [to, setTo] = useState(isRange ? value.split("..")[1] : range?.asOf ?? "");
  const set = (f: string, t: string) => onChange(f && t ? `${f <= t ? f : t}..${f <= t ? t : f}` : "");
  return (
    <span className="periodpick">
      <select value={isRange ? RANGE : value} onChange={(e) => (e.target.value === RANGE ? set(from, to) : onChange(e.target.value))}>
        {periods.map((p) => <option key={p.key} value={p.key}>{p.label}{replaced?.(p.key) ? " (replace)" : ""}</option>)}
        {range && <option value={RANGE}>Choose dates…</option>}
      </select>
      {range && isRange && (
        <span className="dates">
          <input type="date" value={from} max={range.asOf} onChange={(e) => { setFrom(e.target.value); set(e.target.value, to); }} aria-label="From" />
          <span>to</span>
          <input type="date" value={to} max={range.asOf} onChange={(e) => { setTo(e.target.value); set(from, e.target.value); }} aria-label="To" />
        </span>
      )}
    </span>
  );
}
