"use client";
/**
 * The one-line ask box the dashboards share (the PR dashboard's "Ask CeMO anything about this", the Pulse's,
 * a Builder's "What do you want to see here?"): the Chats composer frame on one line, a bold label above it and
 * the primary on the right. What happens on submit is the caller's.
 */
import { useId, type ReactNode } from "react";
import { Button } from "../kit/Button";
import { cn } from "../cn";

const FRAME = "flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 pl-4 shadow-xs transition-all duration-200 focus-within:border-brand-palette-600 focus-within:ring-2 focus-within:ring-brand-palette-500/15";
const INPUT = "h-10 min-w-0 flex-1 border-0 bg-transparent p-0 font-sans text-sm text-gray-900 shadow-none outline-none placeholder:text-gray-500 focus:outline-none focus-visible:outline-none";

export function AskBar({ label, value, onChange, onSubmit, placeholder, ariaLabel, submitLabel, busyLabel, busy, disabled, maxLength = 1500, extra, className }: {
  label: ReactNode; value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; ariaLabel: string;
  submitLabel: string; busyLabel: string; busy?: boolean; disabled?: boolean; maxLength?: number; extra?: ReactNode; className?: string;
}) {
  const id = useId();
  return (
    <form className={cn("flex flex-col gap-1.5", className)} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <label htmlFor={id} className="text-xs font-semibold text-gray-700">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className={cn(FRAME, "min-w-0 flex-1")}>
          <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} aria-label={ariaLabel} placeholder={placeholder} className={INPUT} />
          <Button type="submit" size="sm" disabled={disabled || busy} isLoading={busy} loadingLabel={busyLabel}>{submitLabel}</Button>
        </div>
        {extra}
      </div>
    </form>
  );
}
