import { currentWorkspaceId } from "@/auth/current";
import { reportsHomeData } from "@/reports/home";
import { ReportsScreen, type ReportsView } from "@/ui/reports/ReportsScreen";

export const dynamic = "force-dynamic";

/** Reports: one list of schedules and what they produced, and what came from Chats. ?new=1 sets up a schedule, ?schedule=<id> opens one. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ new?: string; schedule?: string }> }) {
  const ws = await currentWorkspaceId();
  const sp = await searchParams;
  const data = await reportsHomeData(ws);
  const view: ReportsView = sp.new ? { kind: "new" } : sp.schedule && /^[0-9a-f-]{36}$/.test(sp.schedule) ? { kind: "schedule", id: sp.schedule } : !data.reports.length && !data.agents.length ? { kind: "new" } : { kind: "list" };
  return <ReportsScreen agents={data.agents} reports={data.reports} view={view} setup={data.setup} />;
}
