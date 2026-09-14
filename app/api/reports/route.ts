import { currentWorkspaceId } from "@/auth/current";
import { getSkillRun } from "@/chat/persist";
import { createReport, listReports } from "@/reports/store";
import type { SkillResult } from "@/skills/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const ws = await currentWorkspaceId();
  return Response.json(await listReports(ws));
}

/** POST { skill_run_id, title? } -> creates an Ask report from a persisted skill run ("Turn into a report"). */
export async function POST(req: Request) {
  const ws = await currentWorkspaceId();
  const body = (await req.json().catch(() => ({}))) as { skill_run_id?: string; title?: string; decision_id?: string | null };
  if (!body.skill_run_id || !/^[0-9a-f-]{36}$/.test(body.skill_run_id)) return Response.json({ error: "skill_run_id is required" }, { status: 400 });
  const run = await getSkillRun(body.skill_run_id, ws);
  if (!run) return Response.json({ error: "skill run not found" }, { status: 404 });
  const result = run.result as SkillResult;
  if (!result?.skill) return Response.json({ error: "run has no result" }, { status: 400 });
  result.run_id = run.id;
  const { report } = await createReport({ workspaceId: ws, result, diff: null, source: "ask", title: body.title, decisionId: body.decision_id && /^[0-9a-f-]{36}$/.test(body.decision_id) ? body.decision_id : null });
  return Response.json(report, { status: 201 });
}
