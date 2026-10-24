import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * The stat card (DESIGN.md 6.2): a label, one big number, how it moved against a named period, and a line
 * that says what the number counts. Numbers come from the data layer; the tile only lays them out.
 */
export function StatTile({ label, value, delta, sub, action, className }: { label: ReactNode; value: ReactNode; delta?: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-3xl border border-card-border bg-white p-5", className)}>
      <span className="text-sm text-gray-500">{label}</span>
      <b className="truncate text-3xl font-bold leading-tight tabular-nums text-gray-900">{value}</b>
      {delta}
      {sub && <span className="text-xs leading-relaxed text-gray-500">{sub}</span>}
      {action && <span className="mt-auto pt-2">{action}</span>}
    </div>
  );
}

export type DeltaDir = "up" | "down" | "flat" | "none";

// up and down say good or bad (a rise in negative comments is "down"); the glyph keeps it from being colour alone
const DELTA: Record<DeltaDir, string> = {
  up: "text-green-700",
  down: "text-red-700",
  flat: "text-gray-600",
  none: "text-gray-500",
};
const GLYPH: Record<DeltaDir, string> = { up: "▲", down: "▼", flat: "", none: "" };

/** how a number moved: `dir` is good (up) or bad (down), whatever way the number went; `glyph` is the way it went */
export function Delta({ dir, glyph, children }: { dir: DeltaDir; glyph?: "▲" | "▼"; children: ReactNode }) {
  const g = glyph ?? GLYPH[dir];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", DELTA[dir], dir === "none" && "font-regular")}>
      {g && <span aria-hidden="true" className="text-[10px]">{g}</span>}
      {children}
    </span>
  );
}

/** a row of stat tiles: two across on small screens, four (or six) on wide ones */
export function StatRow({ n, children }: { n: number; children: ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", n >= 6 ? "lg:grid-cols-3 2xl:grid-cols-6" : n === 5 ? "lg:grid-cols-3 xl:grid-cols-5" : n === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>{children}</div>;
}
