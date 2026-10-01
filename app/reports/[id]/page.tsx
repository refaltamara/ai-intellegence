import { currentWorkspaceId } from "@/auth/current";
import { notFound, redirect } from "next/navigation";
import { listReportFiles } from "@/reports/files";
import { reportsHomeData } from "@/reports/home";
import { getReport } from "@/reports/store";
import { ReportsHome } from "@/ui/ReportsHome";
import { ReportView } from "@/ui/ReportView";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [report, data, files] = await Promise.all([getReport(id, ws), reportsHomeData(ws), listReportFiles([id], ws)]);
  if (!report) notFound();
  // a deck's version opens in its deck
  if (report.source === "deck" && report.deck_id) redirect(`/decks/${report.deck_id}?v=${report.id}`);
  return (
    <ReportsHome agents={data.agents} reports={data.reports} activeId={report.id} view={{ kind: "doc" }} setup={data.setup}>
      <ReportView report={report} files={files} />
    </ReportsHome>
  );
}
