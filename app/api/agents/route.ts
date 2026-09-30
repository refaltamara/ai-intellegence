import { currentWorkspaceId } from "@/auth/current";
import { agentFromBody, weeklyAgentFromBody, type AgentBody } from "@/agents/api";
import { insertAgent, listAgents, listRuns } from "@/agents/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ws = await currentWorkspaceId();
  const agents = await listAgents(ws);
  const withRuns = await Promise.all(agents.map(async (a) => ({ ...a, runs: await listRuns(a.id, 5) })));
  return Response.json(withRuns);
}

/** POST an AgentDraft, { from_skill_run_id } to promote a run with defaults, or { kind: "weekly_report", ... } for the Weekly Competitor Pulse. */
export async function POST(req: Request) {
  const ws = await currentWorkspaceId();
  const body = (await req.json().catch(() => ({}))) as AgentBody;
  const r = body.kind === "weekly_report" ? await weeklyAgentFromBody(body, ws) : await agentFromBody(body, ws);
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  const agent = await insertAgent(r.agent);
  return Response.json({ agent, notes: r.notes }, { status: 201 });
}
