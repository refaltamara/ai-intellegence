import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { getDecision, listPins, pinRun, unpin } from "@/decisions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  return Response.json(await listPins(id));
}

/** POST { skill_run_id, note? } pins a persisted run to the decision. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { skill_run_id?: string; note?: string };
  if (!UUID.test(id) || !body.skill_run_id || !UUID.test(body.skill_run_id)) return Response.json({ error: "decision id and skill_run_id are required" }, { status: 400 });
  if (!(await getDecision(id, DEFAULT_WORKSPACE_ID))) return Response.json({ error: "decision not found" }, { status: 404 });
  const pin = await pinRun(DEFAULT_WORKSPACE_ID, id, body.skill_run_id, session.uid, body.note ?? null);
  if (!pin) return Response.json({ error: "run not found" }, { status: 404 });
  return Response.json(pin, { status: 201 });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const pinId = new URL(req.url).searchParams.get("pin") ?? "";
  if (!UUID.test(id) || !UUID.test(pinId)) return Response.json({ error: "bad id" }, { status: 400 });
  return Response.json({ removed: await unpin(id, pinId) });
}
