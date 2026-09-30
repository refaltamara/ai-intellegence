import { currentWorkspaceId } from "@/auth/current";
import { runAgent } from "@/agents/runner";
import { getAgent } from "@/agents/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST { week? }: run the schedule now (ignores the timing; still diffs and delivers). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const agent = await getAgent(id, ws);
  if (!agent) return Response.json({ error: "not found" }, { status: 404 });
  // a weekly report can be run for a chosen week (a Monday or YYYY-Www); the runner validates it
  const body = (await req.json().catch(() => ({}))) as { week?: unknown };
  const week = typeof body.week === "string" && /^(\d{4}-\d{2}-\d{2}|\d{4}-W\d{2})$/.test(body.week) ? body.week : undefined;
  const outcome = await runAgent(agent, { reason: "manual", week });
  return Response.json(outcome);
}
