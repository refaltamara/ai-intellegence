import { currentWorkspaceId } from "@/auth/current";
import { notFound } from "next/navigation";
import { listAgents } from "@/agents/store";
import type { WeeklyBlocks } from "@/competitor/scheduled";
import { listReportFiles } from "@/reports/files";
import { getReport, listReports } from "@/reports/store";
import { ReportDoc } from "@/ui/ReportDoc";
import { ReportList } from "@/ui/ReportList";
import { ReportsShell } from "@/ui/ReportsShell";
import { WeeklyDoc } from "@/ui/WeeklyDoc";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [report, reports, agents, files] = await Promise.all([getReport(id, ws), listReports(ws), listAgents(ws), listReportFiles([id], ws)]);
  if (!report) notFound();
  return (
    <ReportsShell tab="library" counts={{ library: reports.length, scheduled: agents.length }}>
      <div className="wrap wide">
        <div className="two" style={{ gridTemplateColumns: "260px 1fr" }}>
          <ReportList reports={reports} activeId={report.id} />
          {report.blocks?.kind === "weekly" ? <WeeklyDoc report={{ ...report, blocks: report.blocks as unknown as WeeklyBlocks }} files={files} /> : <ReportDoc report={report} />}
        </div>
      </div>
    </ReportsShell>
  );
}
