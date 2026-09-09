import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { createDecision, decisionNameFrom, listDecisions, type DecisionStatus } from "@/decisions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") as DecisionStatus | null;
  return Response.json(await listDecisions(DEFAULT_WORKSPACE_ID, status ?? undefined));
}

/** POST { name?, from_prompt?, client_brand_id? } -> a new open decision. */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; from_prompt?: string; client_brand_id?: string | null };
  const name = body.name?.trim() || (body.from_prompt ? decisionNameFrom(body.from_prompt) : "Untitled");
  const d = await createDecision(DEFAULT_WORKSPACE_ID, session.uid, name, body.client_brand_id ?? null);
  return Response.json(d, { status: 201 });
}
