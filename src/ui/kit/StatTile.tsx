import type { ComponentType, ReactNode } from "react";
import { cn } from "../cn";
import { InfoTip } from "./InfoTip";

/**
 * The stat card (DESIGN.md 6.2), drawn like the agency dashboard's StatCard: the label and one big orange number
 * on the left, the metric's icon in an orange tile on the right; under them how it moved against a named period
 * and one short line that says what the number counts, its full sentence behind an ⓘ beside the label (`about`).
 * Numbers come from the data layer; the tile only lays them out.
 */
export function StatTile({ label, value, delta, sub, about, action, icon: Icon, className }: { label: ReactNode; value: ReactNode; delta?: ReactNode; sub?: ReactNode; about?: ReactNode; action?: ReactNode; icon?: ComponentType<{ size?: number }>; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-3xl border border-card-border bg-white p-5", className)}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span title={typeof label === "string" ? label : undefined} className="truncate text-sm font-medium text-gray-500">{label}</span>
            {about && <InfoTip label={`About ${typeof label === "string" ? label.toLowerCase() : "this number"}`}>{about}</InfoTip>}
          </span>
          <b className="truncate text-3xl font-bold leading-tight tabular-nums text-brand-palette-500">{value}</b>
        </div>
        {Icon && <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-palette-100 text-brand-palette-600"><Icon size={24} /></span>}
      </div>
      {delta}
      {/* one line on every tile so a row stays even; the full sentence sits behind the ⓘ (`about`) */}
      {sub && <span title={typeof sub === "string" ? sub : undefined} className="truncate text-xs leading-relaxed text-gray-500">{sub}</span>}
      {/* the action sits on the card's floor, so a row of tiles lines its buttons up whatever the content above */}
      {action && <div className="mt-auto flex pt-2">{action}</div>}
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
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", DELTA[dir], dir === "none" && "font-normal")}>
      {g && <span aria-hidden="true" className="text-[10px]">{g}</span>}
      {children}
    </span>
  );
}

/**
 * a row of stat tiles: one across on a phone, two on a tablet, then on wide screens four in one row, five in one
 * row, or six as two rows of three (six across leaves each tile too narrow for its number and its icon)
 */
export function StatRow({ n, children }: { n: number; children: ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", n >= 6 || n === 3 ? "lg:grid-cols-3" : n === 5 ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4")}>{children}</div>;
}
