import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { runAgent } from "@/agents/runner";
import { getAgent } from "@/agents/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST: run the agent now (ignores the schedule; still diffs and delivers). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const agent = await getAgent(id, DEFAULT_WORKSPACE_ID);
  if (!agent) return Response.json({ error: "not found" }, { status: 404 });
  const outcome = await runAgent(agent, { reason: "manual" });
  return Response.json(outcome);
}
