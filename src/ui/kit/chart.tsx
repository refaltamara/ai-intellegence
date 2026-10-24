/**
 * Shared pieces of the hand-drawn SVG charts (DESIGN.md 6.2, the dataviz rules): the categorical palette, a
 * round top for the axis, the hover tooltip and a legend whose entries are buttons. Every chart draws its own
 * marks; these keep the frame around them the same everywhere.
 */
import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * The categorical palette, in a fixed order: a series keeps its slot whatever else is shown. Checked with the
 * dataviz validator (colour-blind separation passes; the 2nd-5th hues sit under 3:1 on white, so every chart
 * with them has a legend and a table or labels beside it). The one place hex values live in components.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
/** a series past the eighth, or "other", in a neutral */
export const OTHER = "#9ca3af";

/** SVG paint for the frame: recessive grid and axis text */
export const GRID = "var(--color-gray-200)";
export const AXIS = "var(--color-gray-500)";
export const LABEL = "var(--color-gray-600)";

/** the next round number above v, for the top of an axis */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** the hover card: dark, small, positioned by the chart in % of its width */
export function ChartTip({ left, flip, children }: { left: string; flip?: boolean; children: ReactNode }) {
  return (
    <div role="presentation" className="pointer-events-none absolute top-2 z-10 flex min-w-40 flex-col gap-0.5 rounded-lg bg-gray-900 px-2.5 py-2 text-xs text-white shadow-lg [&_b]:font-semibold"
      style={{ left, transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}>
      {children}
    </div>
  );
}

/** one row in the tooltip: a swatch, the name and the value */
export function TipRow({ colour, name, value }: { colour: string; name: ReactNode; value: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <i aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colour }} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <b className="tabular-nums">{value}</b>
    </span>
  );
}

/** a swatch beside a name, for a legend that does not toggle */
export function Swatch({ colour, children }: { colour: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-700">
      <i aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colour }} />
      {children}
    </span>
  );
}

/** a legend whose entries show and hide their series */
export function LegendToggles({ items, hidden, onToggle }: { items: { key: string; label: string; colour: string }[]; hidden: Set<string>; onToggle: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Series">
      {items.map((s) => {
        const on = !hidden.has(s.key);
        return (
          <button key={s.key} type="button" aria-pressed={on} onClick={() => onToggle(s.key)}
            className={cn("inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors max-md:min-h-11",
              on ? "border-card-border bg-white text-gray-800 hover:border-brand-palette-300" : "border-dashed border-gray-300 bg-gray-50 text-gray-500 line-through")}>
            <i aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", !on && "opacity-40")} style={{ background: s.colour }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
