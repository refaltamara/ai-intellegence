import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { getSkillRun } from "@/chat/persist";
import { createReport, listReports } from "@/reports/store";
import type { SkillResult } from "@/skills/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json(await listReports(DEFAULT_WORKSPACE_ID));
}

/** POST { skill_run_id, title? } -> creates an Ask report from a persisted skill run ("Turn into a report"). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { skill_run_id?: string; title?: string };
  if (!body.skill_run_id || !/^[0-9a-f-]{36}$/.test(body.skill_run_id)) return Response.json({ error: "skill_run_id is required" }, { status: 400 });
  const run = await getSkillRun(body.skill_run_id, DEFAULT_WORKSPACE_ID);
  if (!run) return Response.json({ error: "skill run not found" }, { status: 404 });
  const result = run.result as SkillResult;
  if (!result?.skill) return Response.json({ error: "run has no result" }, { status: 400 });
  result.run_id = run.id;
  const { report } = await createReport({ workspaceId: DEFAULT_WORKSPACE_ID, result, diff: null, source: "ask", title: body.title });
  return Response.json(report, { status: 201 });
}
