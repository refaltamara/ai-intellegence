/** POST { action: "release" | "rollback", role, version?, note? }: Refal or Rafli release a draft; a role owner rolls the current release back. */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { isRoleId } from "@/roles/model";
import { releaseVersion, rollbackRole } from "@/roles/store";
import { invalidateSystem } from "@/chat/loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "cms.open")) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; role?: string; version?: string; note?: string };
  if (!isRoleId(b.role)) return Response.json({ error: "Unknown role." }, { status: 400 });
  const who = { email: actor.email, staff: actor.staff };
  const r = b.action === "release"
    ? can(actor, "role.release") ? await releaseVersion(b.role, String(b.version ?? ""), who, b.note || undefined) : { ok: false as const, error: "Only Refal or Rafli can release a version." }
    : b.action === "rollback"
      ? can(actor, "role.rollback") ? await rollbackRole(b.role, who, b.note || undefined) : { ok: false as const, error: "Only role owners can roll a role back." }
      : { ok: false as const, error: "Unknown action." };
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  invalidateSystem();
  return Response.json(r);
}
