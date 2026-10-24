"use client";
/** The segmented control (kit Segmented) as links, for a server-drawn choice that lives in the URL; the clicked option lifts before the new view arrives. */
import { useOptimistic } from "react";
import { PendingLink } from "../kit/NavPending";
import { cn } from "../cn";

export function SegLinks({ label, items }: { label: string; items: { href: string; label: string; on: boolean }[] }) {
  const [on, setOn] = useOptimistic(items.find((x) => x.on)?.href ?? null);
  return (
    <nav aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
      {items.map((x) => (
        <PendingLink key={x.href} href={x.href} scroll={false} before={() => setOn(x.href)} aria-current={x.href === on ? "true" : undefined}
          className={cn("inline-flex min-h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors duration-150 max-md:min-h-11", x.href === on ? "bg-white text-brand-palette-700 shadow-xs" : "text-gray-600 hover:text-gray-900")}>
          {x.label}
        </PendingLink>
      ))}
    </nav>
  );
}
