/** The Role Lab (src/roles/lab.ts): POST { role, version, text } is one turn with the Lab's AI on a draft. Role owners only. */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { isRoleId } from "@/roles/model";
import { labTurn } from "@/roles/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "role.draft")) return Response.json({ error: "The Role Lab is for role owners." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { role?: string; version?: string; text?: string };
  if (!isRoleId(b.role) || !b.version || !b.text?.trim()) return Response.json({ error: "role, version and text are required" }, { status: 400 });
  const r = await labTurn(b.role, b.version, { email: actor.email, staff: actor.staff }, b.text.trim().slice(0, 4000));
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: 400 });
}
