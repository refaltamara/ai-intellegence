/**
 * Small pieces every dashboard view shares (Brand & KOL, PR, Social, the Pulse): the page frame, the "Ask why"
 * link, the platform tag, a bar on a track. Server-safe: no hooks, no handlers.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { PLATFORM_NAME, PLATFORM_SHORT } from "@/dashboard/askref";
import { cn } from "../cn";

/** the page root: data-tw so legacy.css's bare table rules step aside; full width, sections stacked */
export const DASH_PAGE = "flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6";

/** two sections, or two lists, side by side from lg up */
export const TWO = "grid min-w-0 gap-6 lg:grid-cols-2";

/** a quiet link that opens Chats about one figure; always visible, so it works on touch too */
export function AskLink({ href, children = "Ask why", label, className }: { href: string; children?: ReactNode; label?: string; className?: string }) {
  return (
    <Link href={href} aria-label={label} className={cn("inline-flex min-h-8 items-center whitespace-nowrap rounded-lg text-xs font-semibold text-brand-palette-700 underline-offset-2 hover:text-brand-palette-800 hover:underline max-md:min-h-11", className)}>
      {children}
    </Link>
  );
}

/** an outward link to a post or a profile */
export function OutLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className={cn("font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline", className)}>{children}</a>;
}

/** which platform: a neutral two-letter tag with the full name for screen readers and on hover */
export function PlatformTag({ p, long }: { p: string; long?: boolean }) {
  const name = PLATFORM_NAME[p] ?? p;
  return (
    <span title={name} className="inline-flex h-5 shrink-0 items-center rounded-md bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-700">
      {long ? name : <><span aria-hidden="true">{PLATFORM_SHORT[p] ?? p}</span><span className="sr-only">{name}</span></>}
    </span>
  );
}

/** a small grey tag beside a name (format, own post, a brand) */
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "down" | "up" }) {
  const t = { neutral: "bg-gray-100 text-gray-700", brand: "bg-brand-palette-100 text-brand-palette-800", down: "bg-red-50 text-red-700", up: "bg-green-50/60 text-green-700" }[tone];
  return <span className={cn("inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold", t)}>{children}</span>;
}

/** one bar on a grey track, 0 to 100; the colour is a class (the brand's own) or a palette colour */
export function Bar({ pct, className, colour, label }: { pct: number | null | undefined; className?: string; colour?: string; label?: string }) {
  const w = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="block h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <span className={cn("block h-full rounded-full", !colour && "bg-brand-palette-600", className)} style={{ width: `${w}%`, background: colour }} />
    </span>
  );
}

/** the segmented control as links (client: the clicked option lifts at once) */
export { SegLinks } from "./SegLinks";

/** label and value pairs under a card (tiers, posts) */
export function Facts({ items, cols = 2 }: { items: { k: string; v: ReactNode; title?: string }[]; cols?: 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-3 gap-y-2", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {items.map((x) => (
        <div key={x.k} className="min-w-0">
          <dt className="truncate text-[11px] text-gray-500">{x.k}</dt>
          <dd className="text-sm font-semibold tabular-nums text-gray-900" title={x.title}>{x.v}</dd>
        </div>
      ))}
    </dl>
  );
}
