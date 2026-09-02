import { notFound } from "next/navigation";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { getReport, listReports } from "@/reports/store";
import { ReportDoc } from "@/ui/ReportDoc";
import { ReportList } from "@/ui/ReportList";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [report, reports] = await Promise.all([getReport(id, DEFAULT_WORKSPACE_ID), listReports(DEFAULT_WORKSPACE_ID)]);
  if (!report) notFound();
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Reports</h1><span className="meta">Outputs from agents and Ask</span></div>
        <span className="pill">{reports.length} report{reports.length === 1 ? "" : "s"}</span>
      </div>
      <div className="wrap wide">
        <div className="two" style={{ gridTemplateColumns: "260px 1fr" }}>
          <ReportList reports={reports} activeId={report.id} />
          <ReportDoc report={report} />
        </div>
      </div>
    </section>
  );
}
