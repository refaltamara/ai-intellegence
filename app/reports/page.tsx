import { currentWorkspaceId } from "@/auth/current";
import { listAgents, listRuns } from "@/agents/store";
import { hasModelCredentials } from "@/chat/loop";
import { getReport, listReports } from "@/reports/store";
import { impls } from "@/skills/index";
import { listSkills } from "@/skills/registry";
import { Agents } from "@/ui/Agents";
import { ReportDoc } from "@/ui/ReportDoc";
import { ReportList } from "@/ui/ReportList";
import { ReportsShell } from "@/ui/ReportsShell";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ws = await currentWorkspaceId();
  const tab = (await searchParams).tab === "scheduled" ? "scheduled" : "library";
  const [reports, agents] = await Promise.all([listReports(ws), listAgents(ws)]);
  const counts = { library: reports.length, scheduled: agents.length };
  if (tab === "scheduled") {
    const withRuns = await Promise.all(agents.map(async (a) => ({ ...a, runs: await listRuns(a.id, 8) })));
    return (
      <ReportsShell tab="scheduled" counts={counts}>
        <Agents agents={withRuns} skills={listSkills().filter((d) => !!impls[d.name]).map((d) => ({ name: d.name, title: d.title }))} modelConfigured={hasModelCredentials()} emailConfigured={!!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)} />
      </ReportsShell>
    );
  }
  const latest = reports[0] ? await getReport(reports[0].id, ws) : null;
  return (
    <ReportsShell tab="library" counts={counts}>
      <div className="wrap wide">
        <div className="two" style={{ gridTemplateColumns: "260px 1fr" }}>
          <ReportList reports={reports} activeId={latest?.id ?? null} />
          {latest ? <ReportDoc report={latest} /> : <div className="empty">The newest report opens here.</div>}
        </div>
      </div>
    </ReportsShell>
  );
}
