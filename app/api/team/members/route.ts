/**
 * A workspace's people (the Team page, the CMS). PATCH { workspace_id?, user_id, levels }
 * changes someone's teams; DELETE ?user_id=&workspace_id= takes them out. A Builder
 * manages Members; only Fair (owners, data ops) makes or removes a Builder.
 */
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can, isLevel, rolesFor, type Level } from "@/auth/can";
import { listMembers, removeMember, setLevels } from "@/auth/accounts";
import { audit } from "@/roles/store";
import { getWorkspace } from "@/workspace/store";
import type { RoleId } from "@/roles/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function target(workspaceId: string | null, userId: string) {
  const ws = workspaceId ?? (await currentWorkspaceId());
  const m = (await listMembers(ws)).find((x) => x.user_id === userId);
  return { ws, m };
}

export async function PATCH(req: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { workspace_id?: string; user_id?: string; levels?: Record<string, unknown> };
  const { ws, m } = await target(b.workspace_id ?? null, String(b.user_id ?? ""));
  if (!m) return Response.json({ error: "Not a member of this workspace." }, { status: 404 });
  const offered = (await getWorkspace(ws))?.roles ?? [];
  let levels = Object.fromEntries(Object.entries(b.levels ?? {}).filter(([r, l]) => offered.includes(r as RoleId) && isLevel(l))) as Partial<Record<RoleId, Level>>;
  if (!can(actor, "workspace.builders", { workspace: ws })) {
    // a Builder changes only the teams they are on; the rest stays as it was
    const mine = new Set(rolesFor(actor, ws, offered));
    levels = Object.fromEntries(offered.map((r) => [r, mine.has(r) ? levels[r] : m.levels[r]]).filter(([, l]) => l)) as Partial<Record<RoleId, Level>>;
  }
  const builderTouched = [...Object.values(levels), ...Object.values(m.levels)].includes("builder");
  if (!can(actor, "team.manage", { workspace: ws }) || (builderTouched && !can(actor, "workspace.builders", { workspace: ws }))) {
    return Response.json({ error: builderTouched ? "Only Fair can make or change a Builder." : "You can't change this team." }, { status: 403 });
  }
  if (!Object.keys(levels).length) return Response.json({ error: "Keep at least one team, or remove them instead." }, { status: 400 });
  await setLevels(ws, m.user_id, levels);
  await audit({ workspace_id: ws, actor: actor.email, area: "people", action: "levels", path: m.email, old: m.levels, new: levels });
  return Response.json({ ok: true, levels });
}

export async function DELETE(req: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const u = new URL(req.url).searchParams;
  const { ws, m } = await target(u.get("workspace_id"), u.get("user_id") ?? "");
  if (!m) return Response.json({ error: "Not a member of this workspace." }, { status: 404 });
  if (m.user_id === actor.uid) return Response.json({ error: "You can't remove yourself." }, { status: 400 });
  const isBuilder = Object.values(m.levels).includes("builder");
  if (!can(actor, "team.manage", { workspace: ws }) || ((isBuilder || m.staff.length) && !can(actor, "workspace.builders", { workspace: ws }))) {
    return Response.json({ error: "You can't remove this person." }, { status: 403 });
  }
  await removeMember(ws, m.user_id);
  await audit({ workspace_id: ws, actor: actor.email, area: "people", action: "remove", path: m.email, old: m.levels });
  return Response.json({ ok: true });
}
