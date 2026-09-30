/** Reports has two halves (30 Sep 2026): the library of everything produced, and what runs on a schedule. */
import Link from "next/link";
import type { ReactNode } from "react";

export type ReportsTab = "library" | "scheduled";

export function ReportsShell({ tab, counts, children }: { tab: ReportsTab; counts: { library: number; scheduled: number }; children: ReactNode }) {
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Reports</h1><span className="meta">{tab === "scheduled" ? "Analyses that run on a schedule and land in the library, or in your inbox" : "Everything produced from Chats and from schedules"}</span></div>
        <nav className="seg" aria-label="Reports">
          <Link href="/reports" className={tab === "library" ? "on" : ""}>Library · {counts.library}</Link>
          <Link href="/reports?tab=scheduled" className={tab === "scheduled" ? "on" : ""}>Scheduled · {counts.scheduled}</Link>
        </nav>
      </div>
      {children}
    </section>
  );
}
