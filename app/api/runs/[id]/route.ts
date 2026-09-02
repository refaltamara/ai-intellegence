import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { getSkillRun } from "@/chat/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const run = await getSkillRun(id, DEFAULT_WORKSPACE_ID);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(run);
}
