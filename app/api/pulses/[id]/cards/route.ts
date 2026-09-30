/** POST: add a card ({ kind, config, size?, title? } or { kind: "skill", skill_run_id }). PUT { ids }: put the cards in this order. */
import { currentWorkspaceId } from "@/auth/current";
import { addCardFromBody } from "@/pulses/api";
import { getPulse, reorderCards } from "@/pulses/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await getPulse(id, ws))) return Response.json({ error: "not found" }, { status: 404 });
  const r = await addCardFromBody(id, ws, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  return "error" in r ? Response.json(r, { status: 400 }) : Response.json(r, { status: 201 });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await getPulse(id, ws))) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 60) : [];
  await reorderCards(id, ws, ids);
  return Response.json({ ok: true });
}
