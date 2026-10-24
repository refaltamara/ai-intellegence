import type { ReactNode } from "react";
import { cn } from "../cn";

/** the section card (DESIGN.md 6.2 Card): white, bordered, flat */
export const CARD = "flex flex-col gap-4 rounded-3xl border border-card-border bg-white p-5 md:p-6";

/** a section's heading with its line flush under it */
export function SectionTitle({ title, hint, as: H = "h2" }: { title: ReactNode; hint?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="min-w-0">
      <H className={cn("font-semibold leading-tight text-gray-900", H === "h2" ? "text-lg" : "text-sm")}>{title}</H>
      {hint && <p className="text-xs leading-relaxed text-gray-500">{hint}</p>}
    </div>
  );
}

/**
 * One section of a screen: a card with its title, what it shows, the section's own actions on the right
 * (Add to a deck, a toggle) and the content. `bare` drops the frame for content that brings its own cards.
 */
export function SectionCard({ title, hint, actions, id, bare, className, children }: { title: ReactNode; hint?: ReactNode; actions?: ReactNode; id?: string; bare?: boolean; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn(bare ? "flex flex-col gap-4" : CARD, "min-w-0 scroll-mt-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <SectionTitle title={title} hint={hint} />
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** a small inner panel inside a section (one of two lists side by side, a group of quotes) */
export function Panel({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border border-card-border p-4", className)}>
      {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
      {children}
    </div>
  );
}

/** "nothing here" inside a section: why, in one sentence */
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500", className)}>{children}</p>;
}

/** notes about the data above a screen (the data layer's caveats): one amber box, a line each */
export function Notes({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
      {lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}

/** the one-error box (DESIGN.md 6.2) */
export function ErrorBox({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>;
}
