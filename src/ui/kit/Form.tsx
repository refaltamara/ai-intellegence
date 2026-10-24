/**
 * Compact form pieces for filter drawers (the pane's Refine, creator discovery): a labelled field with an
 * optional hint, a native select and a text input in the agency dashboard's input look, and a row of
 * toggle chips. Labels sit above, as DESIGN.md 9.1 has them.
 */
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * group: the field holds several controls (chips, a min and a max, a multi-select); it is a labelled group
 * then, because a <label> around them would toggle the first chip whenever its text is clicked.
 */
export function Field({ label, hint, wide, group, children, className }: { label: string; hint?: ReactNode; wide?: boolean; group?: boolean; children: ReactNode; className?: string }) {
  const head = (
    <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-700">
      <span className="font-semibold">{label}</span>
      {hint && <span className="text-gray-500">{hint}</span>}
    </span>
  );
  const cls = cn("flex min-w-0 flex-col gap-1.5", wide && "col-span-full", className);
  return group ? <div role="group" aria-label={label} className={cls}>{head}{children}</div> : <label className={cls}>{head}{children}</label>;
}

const INPUT = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-sans text-sm text-gray-900 outline-none transition-all duration-200 placeholder:text-gray-500 focus:border-brand-palette-600 focus:ring-2 focus:ring-brand-palette-500/15";

export function NativeSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(INPUT, "cursor-pointer pr-8", className)} {...rest}>{children}</select>;
}

export function TextField({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(INPUT, className)} {...rest} />;
}

/** one chip of a toggle row; `on` is the chosen state, read out as pressed */
export function Chip({ on, dashed, className, children, ...rest }: { on?: boolean; dashed?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-pressed={on} className={cn(
      "inline-flex min-h-9 cursor-pointer items-center rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600",
      on ? "border-brand-palette-300 bg-brand-palette-50 text-brand-palette-700" : "border-slate-200 bg-white text-gray-700 hover:border-brand-palette-300 hover:text-brand-palette-700",
      dashed && "border-dashed",
      className,
    )} {...rest}>{children}</button>
  );
}
