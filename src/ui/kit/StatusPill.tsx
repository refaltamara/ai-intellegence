import type { ReactNode } from "react";
import { cn } from "../cn";

export type PillTone = "live" | "ok" | "waiting" | "neutral" | "brand" | "error" | "critical";

const TONE: Record<PillTone, string> = {
  live: "bg-green-50/60 text-green-700",
  waiting: "bg-amber-50 text-amber-800",
  neutral: "bg-gray-100 text-gray-700",
  brand: "bg-brand-palette-100 text-brand-palette-800",
  error: "bg-red-50 text-red-700",
  // good, but not a live state: no dot (the PR dashboard's Calm)
  ok: "bg-green-50/60 text-green-700",
  // the worst state there is (PR's Crisis): white on red-700, 6.5:1
  critical: "bg-red-700 text-white",
};

/** Where something stands (DESIGN.md 6.2). The dot appears only on a live state and never pulses. */
export function StatusPill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone], className)}>
      {tone === "live" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-600" />}
      {children}
    </span>
  );
}
