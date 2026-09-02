import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { getReport, listReports } from "@/reports/store";
import { ReportDoc } from "@/ui/ReportDoc";
import { ReportList } from "@/ui/ReportList";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await listReports(DEFAULT_WORKSPACE_ID);
  const latest = reports[0] ? await getReport(reports[0].id, DEFAULT_WORKSPACE_ID) : null;
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Reports</h1><span className="meta">Outputs from agents and Ask</span></div>
        <span className="pill">{reports.length} report{reports.length === 1 ? "" : "s"}</span>
      </div>
      <div className="wrap wide">
        <div className="two" style={{ gridTemplateColumns: "260px 1fr" }}>
          <ReportList reports={reports} activeId={latest?.id ?? null} />
          {latest ? <ReportDoc report={latest} /> : <div className="empty">The newest report opens here.</div>}
        </div>
      </div>
    </section>
  );
}
