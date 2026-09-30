import Link from "next/link";
import type { ReportRow } from "@/reports/store";

export function ReportList({ reports, activeId }: { reports: ReportRow[]; activeId: string | null }) {
  if (!reports.length) return <div className="empty">No reports yet. Schedule the Weekly Competitor Pulse, or press "Turn into a report" under an answer in Chats.</div>;
  return (
    <div className="rep-list">
      {reports.map((r) => {
        const d = r.blocks?.diff;
        const sub = r.blocks?.kind === "weekly" ? `${new Date(r.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" })} · weekly deck · ${r.blocks.week?.iso ?? ""}` : `${new Date(r.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" })} · ${r.source === "agent" ? "from agent" : "from Ask"}${d ? (d.first_run ? " · baseline" : ` · ${d.new + d.gone + d.changed} changes`) : ""}`;
        return <Link key={r.id} href={`/reports/${r.id}`} className={r.id === activeId ? "on" : ""}><b>{r.title}</b><span>{sub}</span></Link>;
      })}
    </div>
  );
}
