"use client";
/** The toggle switch (DESIGN.md 6.2): a real button with role switch, its label beside it and an optional hint under the label. */
import type { ReactNode } from "react";
import { cn } from "../cn";

export function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200", on ? "bg-brand-palette-600" : "bg-gray-300")}>
      <span className={cn("h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-200", on ? "translate-x-4" : "translate-x-0")} />
    </span>
  );
}

export function Switch({ on, onChange, label, hint, disabled, className }: { on: boolean; onChange: (next: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-2xl px-1 py-2 text-left font-sans focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600 disabled:cursor-not-allowed disabled:opacity-60", className)}>
      <span className="pt-0.5"><SwitchKnob on={on} /></span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </span>
    </button>
  );
}
