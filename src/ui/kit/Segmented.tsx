"use client";
/**
 * The segmented control (DESIGN.md 6.2): a grey track with the chosen option lifted onto white. One choice
 * by default (a radio group); `tabs` makes it a tab list, for filters over a list below it.
 */
import { cn } from "../cn";

export type SegOption<K extends string> = { key: K; label: string; count?: number; disabled?: boolean; title?: string };

export function Segmented<K extends string>({ options, value, onChange, label, tabs, size = "md", className }: { options: SegOption<K>[]; value: K; onChange: (k: K) => void; label: string; tabs?: boolean; size?: "sm" | "md"; className?: string }) {
  return (
    <div role={tabs ? "tablist" : "radiogroup"} aria-label={label} className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-gray-100 p-1", className)}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" role={tabs ? "tab" : "radio"} {...(tabs ? { "aria-selected": on } : { "aria-checked": on })} disabled={o.disabled} title={o.title} onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 font-sans text-xs font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-palette-600 disabled:cursor-not-allowed disabled:text-gray-500",
              size === "sm" ? "min-h-8 max-md:min-h-11" : "min-h-9 max-md:min-h-11",
              on ? "bg-white text-brand-palette-700 shadow-xs" : "text-gray-600 hover:text-gray-900",
            )}>
            {o.label}
            {o.count != null && <span className={cn("min-w-5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", on ? "bg-brand-palette-100 text-brand-palette-800" : "bg-white text-gray-700")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
