/** PATCH { enabled }: the owner switches caption reading on or off for this workspace (DECISIONS, 2 Oct 2026). */
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { captionStatus } from "@/captions/run";
import { sql } from "@/db/client";
import { toJson } from "@/db/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (session.role !== "owner") return Response.json({ error: "Only the owner can switch caption reading." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof b.enabled !== "boolean") return Response.json({ error: "enabled must be true or false" }, { status: 400 });
  await sql.query(
    "update workspaces set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{captions}', coalesce(settings->'captions', '{}'::jsonb) || $2::jsonb) where id = $1 and kind <> 'profile'",
    [ws, toJson({ enabled: b.enabled })],
  );
  return Response.json(await captionStatus(ws));
}
