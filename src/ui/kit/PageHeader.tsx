import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * The compact page header Chats has (DESIGN.md 6.3): a small title with its line flush under it, the page's
 * actions beside them, and a dashed line that closes the header. It scrolls with the page, except on Chats, which pins it
 * above the thread.
 */
export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    // border-0 first: without preflight, border-dashed would draw the browser's default width on all four sides
    <header className={cn("flex flex-col gap-3 border-0 border-b border-dashed border-gray-300 pb-4 pt-4 md:flex-row md:items-center md:justify-between md:gap-6 md:pt-6", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
