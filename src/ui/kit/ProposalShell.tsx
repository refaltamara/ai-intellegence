import type { ReactNode } from "react";
import { cn } from "../cn";

export type ProposalTone = "draft" | "waiting" | "approved" | "sent_back" | "rejected" | "removed";

const TONE: Record<ProposalTone, string> = {
  draft: "bg-gray-100 text-gray-700",
  waiting: "bg-amber-50 text-amber-800",
  approved: "bg-green-50/60 text-green-700",
  sent_back: "bg-amber-50 text-amber-800",
  rejected: "bg-red-50 text-red-700",
  removed: "bg-gray-100 text-gray-600",
};

/**
 * The frame of a card CeMO proposes in the thread (a skill, a change, a data extension, case words, a deck
 * change): what kind it is, its title, where it stands, then the body and the buttons that act on it.
 */
export function ProposalShell({ kind, title, status, tone, children, actions, error }: { kind: string; title: ReactNode; status: string; tone: ProposalTone; children?: ReactNode; actions?: ReactNode; error?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-brand-palette-100 px-2 py-0.5 text-[11px] font-semibold text-brand-palette-800">{kind}</span>
          <span className="min-w-0 text-sm font-semibold text-gray-900">{title}</span>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone])}>{status}</span>
      </div>
      {children && <div className="flex flex-col gap-2.5 border-t border-card-border px-4 py-3 text-sm text-gray-700">{children}</div>}
      {(actions || error) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-card-border bg-gray-50/60 px-4 py-3">
          {error && <span role="alert" className="mr-auto text-xs text-red-700">{error}</span>}
          {actions}
        </div>
      )}
    </div>
  );
}

/** a quiet line inside a proposal: a note, a count, what it would cost */
export const muted = "text-xs text-gray-500";
