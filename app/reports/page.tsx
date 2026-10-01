import { currentWorkspaceId } from "@/auth/current";
import { listReportFiles } from "@/reports/files";
import { reportsHomeData } from "@/reports/home";
import { getReport } from "@/reports/store";
import { ReportsHome, type ReportsView } from "@/ui/ReportsHome";
import { ReportView } from "@/ui/ReportView";

export const dynamic = "force-dynamic";

/** Reports: one list of schedules and what they produced, and what came from Chats. ?new=1 sets up a schedule, ?schedule=<id> opens one. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ new?: string; schedule?: string }> }) {
  const ws = await currentWorkspaceId();
  const sp = await searchParams;
  const data = await reportsHomeData(ws);
  const view: ReportsView = sp.new ? { kind: "new" } : sp.schedule && /^[0-9a-f-]{36}$/.test(sp.schedule) ? { kind: "schedule", id: sp.schedule } : !data.reports.length ? { kind: data.agents.length ? "doc" : "new" } : { kind: "doc" };
  const latest = view.kind === "doc" && data.reports[0] ? await getReport(data.reports[0].id, ws) : null;
  const files = latest ? await listReportFiles([latest.id], ws) : [];
  return (
    <ReportsHome agents={data.agents} reports={data.reports} activeId={latest?.id ?? null} view={view} setup={data.setup}>
      {latest ? <ReportView report={latest} files={files} /> : null}
    </ReportsHome>
  );
}
