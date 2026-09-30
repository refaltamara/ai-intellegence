import { currentWorkspaceId } from "@/auth/current";
import { notFound } from "next/navigation";
import { listAgents } from "@/agents/store";
import { getReport, listReports } from "@/reports/store";
import { ReportDoc } from "@/ui/ReportDoc";
import { ReportList } from "@/ui/ReportList";
import { ReportsShell } from "@/ui/ReportsShell";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [report, reports, agents] = await Promise.all([getReport(id, ws), listReports(ws), listAgents(ws)]);
  if (!report) notFound();
  return (
    <ReportsShell tab="library" counts={{ library: reports.length, scheduled: agents.length }}>
      <div className="wrap wide">
        <div className="two" style={{ gridTemplateColumns: "260px 1fr" }}>
          <ReportList reports={reports} activeId={report.id} />
          <ReportDoc report={report} />
        </div>
      </div>
    </ReportsShell>
  );
}
