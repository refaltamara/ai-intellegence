/** A Builder's monthly cap on the workspace's credits (src/credits/ledger.ts). POST { cap: number | null } */
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { setCap } from "@/credits/ledger";
import { getWorkspace } from "@/workspace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const roles = (await getWorkspace(ws))?.roles ?? [];
  if (!roles.some((r) => can(actor, "company.change", { workspace: ws, role: r }))) return Response.json({ error: "Only a Builder sets the cap." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { cap?: unknown; note?: string };
  const raw = b.cap ?? b.note;
  const cap = raw == null || String(raw).trim() === "" || String(raw).trim().toLowerCase() === "none" ? null : Number(String(raw).replace(/[^\d.]/g, ""));
  if (cap != null && !(Number.isFinite(cap) && cap >= 0)) return Response.json({ error: "A cap is a number of credits, or empty for none." }, { status: 400 });
  await setCap(ws, cap, actor.email);
  return Response.json({ ok: true, cap });
}
