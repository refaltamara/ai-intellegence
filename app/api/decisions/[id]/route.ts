import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { getDecision, listPins, moveThread, updateDecision, type DecisionStatus } from "@/decisions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const d = await getDecision(id, DEFAULT_WORKSPACE_ID);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ...d, pins: await listPins(id) });
}

/** PATCH { name?, status?, outcome?, client_brand_id?, move_thread? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; status?: DecisionStatus; outcome?: string | null; client_brand_id?: string | null; move_thread?: string };
  if (body.status && !["open", "decided", "archived"].includes(body.status)) return Response.json({ error: "bad status" }, { status: 400 });
  if (body.move_thread) {
    if (!UUID.test(body.move_thread)) return Response.json({ error: "bad thread id" }, { status: 400 });
    const ok = await moveThread(body.move_thread, id, session.uid);
    if (!ok) return Response.json({ error: "thread not found or not yours" }, { status: 404 });
  }
  const d = await updateDecision(id, DEFAULT_WORKSPACE_ID, { name: body.name, status: body.status, outcome: body.outcome, client_brand_id: body.client_brand_id });
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(d);
}
