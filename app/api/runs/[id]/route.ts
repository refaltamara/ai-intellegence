import { currentWorkspaceId } from "@/auth/current";
import { getSkillRun } from "@/chat/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const run = await getSkillRun(id, ws);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(run);
}
