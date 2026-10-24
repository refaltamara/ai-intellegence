/**
 * The table (DESIGN.md 6.2) as class names, so a server component can draw one too: a white header row
 * closed by a line, zebra rows that tint on hover, numbers right-aligned. The page root carries data-tw so
 * legacy.css's bare table rules step aside. SortHeader and Pager are the interactive pieces.
 */
import type { ReactNode } from "react";
import { cn } from "../cn";

export const TABLE_FRAME = "overflow-x-auto rounded-2xl border border-card-border bg-white";
export const TABLE = "w-full border-collapse";
export const THEAD = "border-0 border-b border-card-border bg-white";
export const TH = "px-3 py-2.5 text-left text-sm font-semibold text-gray-900";
export const TH_NUM = "px-3 py-2.5 text-right text-sm font-semibold text-gray-900 whitespace-nowrap";
export const TR = "border-0 border-b border-card-border transition-colors last:border-b-0 even:bg-gray-50/60 hover:bg-brand-palette-50";
export const TD = "px-3 py-2.5 align-top text-sm text-gray-700";
export const TD_NUM = "px-3 py-2.5 align-top text-right text-sm tabular-nums text-gray-700 whitespace-nowrap";
/** a second line under a cell's value */
export const SUB = "block text-xs text-gray-500";
export const EMPTY_ROW = "px-3 py-8 text-center text-sm text-gray-500";

/** the frame and the table in one; `min` is the width under which it scrolls sideways */
export function Table({ head, children, min, className }: { head: ReactNode; children: ReactNode; min?: string; className?: string }) {
  return (
    <div className={cn(TABLE_FRAME, className)}>
      <table className={cn(TABLE, min)}>
        <thead className={THEAD}><tr>{head}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** a sortable column's header: a button inside the th, aria-sort on the th, the active one in orange with its arrow */
export function SortHeader({ active, onSort, title, num = true, children }: { active: boolean; onSort: () => void; title?: string; num?: boolean; children: ReactNode }) {
  return (
    <th aria-sort={active ? "descending" : "none"} className={num ? TH_NUM : TH}>
      <button type="button" onClick={onSort} title={title}
        className={cn("inline-flex cursor-pointer items-center gap-1 rounded-md font-sans font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600", active ? "text-brand-palette-700" : "text-gray-900 hover:text-brand-palette-700")}>
        {children}{active && <span aria-hidden="true">↓</span>}
      </button>
    </th>
  );
}

/** Pagination (DESIGN.md 6.2): where you are on the left, Previous and Next on the right; links or buttons */
export function Pager({ page, pages, note, prev, next }: { page: number; pages: number; note?: ReactNode; prev: ReactNode; next: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-gray-500">{note ?? `Page ${page + 1} of ${pages.toLocaleString("en-US")}`}</span>
      <span className="flex gap-2">{prev}{next}</span>
    </div>
  );
}
