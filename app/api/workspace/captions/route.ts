/** PATCH { enabled?, since? }: Fair's owners or data ops switch caption reading on or off, or sets the first day it reads (YYYY-MM-DD, null for all) (DECISIONS, 2 Oct 2026). */
import { currentActor, currentSession, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { captionSince, captionStatus } from "@/captions/run";
import { sql } from "@/db/client";
import { toJson } from "@/db/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const actor = await currentActor();
  if (!actor || !can(actor, "workspace.data", { workspace: ws })) return Response.json({ error: "Only Fair's owners or data ops can switch caption reading." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { enabled?: unknown; since?: unknown };
  const patch: { enabled?: boolean; since?: string | null } = {};
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== "boolean") return Response.json({ error: "enabled must be true or false" }, { status: 400 });
    patch.enabled = b.enabled;
  }
  if (b.since !== undefined) {
    const since = b.since === null || b.since === "" ? null : captionSince(b.since);
    if (since === null && b.since !== null && b.since !== "") return Response.json({ error: "since must be a date (YYYY-MM-DD) or empty" }, { status: 400 });
    patch.since = since;
  }
  if (!Object.keys(patch).length) return Response.json({ error: "nothing to change" }, { status: 400 });
  await sql.query(
    "update workspaces set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{captions}', coalesce(settings->'captions', '{}'::jsonb) || $2::jsonb) where id = $1 and kind <> 'profile'",
    [ws, toJson(patch)],
  );
  return Response.json(await captionStatus(ws));
}
