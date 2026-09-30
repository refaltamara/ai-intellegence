/** PATCH { name?, description? } or DELETE one Pulse of this team. */
import { currentWorkspaceId } from "@/auth/current";
import { deletePulse, updatePulse } from "@/pulses/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
  const p = await updatePulse(id, ws, {
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : undefined,
    description: typeof b.description === "string" ? b.description.slice(0, 200) : undefined,
  });
  return p ? Response.json(p) : Response.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const ok = await deletePulse(id, ws);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
