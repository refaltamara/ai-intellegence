/**
 * Pieces the deck form and the slide viewer share: the section card, its heading, a checkbox card for a slide,
 * the Fair / team badge, and the Chats composer frame (DESIGN.md 6.3) for the side panel's inputs.
 */
import type { ReactNode } from "react";
import { isFairBadge } from "../../brand/demo";
import { cn } from "../cn";

export const CARD = "flex flex-col gap-4 rounded-3xl border border-card-border bg-white p-5 md:p-6";

/** the frame is the input; a textarea inside it has no border, outline or shadow of its own */
export const COMPOSER = "flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs transition-all duration-200 focus-within:border-brand-palette-600 focus-within:ring-2 focus-within:ring-brand-palette-500/15";
export const COMPOSER_INPUT = "block min-h-12 w-full resize-none border-0 bg-transparent px-1 py-0 font-sans text-sm leading-relaxed text-gray-900 shadow-none outline-none placeholder:text-gray-500 focus:outline-none focus-visible:outline-none";

export function SectionTitle({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold leading-tight text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/** Fair's own work in the brand tint, the team's in grey, so the two never read alike */
export function MadeBy({ badge, by }: { badge?: string | null; by?: string | null }) {
  if (!badge) return null;
  return (
    <span title={by ? `Made by ${by}` : undefined} className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", isFairBadge(badge) ? "bg-brand-palette-100 text-brand-palette-800" : "bg-gray-100 text-gray-700")}>{badge}</span>
  );
}

/** one slide to tick: a label, so the whole card toggles its checkbox */
export function CheckCard({ checked, disabled, onChange, title, tag, badge, description }: { checked: boolean; disabled?: boolean; onChange: () => void; title: string; tag?: string; badge?: ReactNode; description?: string }) {
  return (
    <label className={cn(
      "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors",
      disabled ? "cursor-not-allowed border-card-border bg-gray-50 text-gray-500" : checked ? "border-brand-palette-200 bg-brand-palette-50" : "border-card-border bg-white hover:border-brand-palette-300",
    )}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-palette-600 disabled:cursor-not-allowed" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className={cn("text-sm font-semibold", disabled ? "text-gray-600" : "text-gray-900")}>{title}</b>
          {tag && <small className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">{tag}</small>}
          {badge}
        </span>
        {description && <span className="text-xs leading-relaxed text-gray-500">{description}</span>}
      </span>
    </label>
  );
}
