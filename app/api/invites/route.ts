/**
 * Invitations (src/auth/invites.ts). POST { workspace_id?, email, name?, levels, staff? }
 * sends one (the workspace defaults to the current one); GET lists the open ones of a
 * workspace; DELETE ?id= withdraws one. Every check is can() (src/auth/can.ts).
 */
import { headers } from "next/headers";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { createInvite, listInvites, revokeInvite } from "@/auth/invites";
import { originOf } from "@/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const ws = new URL(req.url).searchParams.get("workspace_id") ?? (await currentWorkspaceId());
  if (!can(actor, "team.manage", { workspace: ws })) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ invites: await listInvites(ws) });
}

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { workspace_id?: string; email?: string; name?: string; levels?: Record<string, string>; staff?: string[] };
  const ws = b.workspace_id ? String(b.workspace_id) : await currentWorkspaceId();
  const r = await createInvite(actor, { workspace_id: ws, email: String(b.email ?? ""), name: b.name ?? null, levels: (b.levels ?? {}) as never, staff: (b.staff ?? []) as never }, originOf(await headers()));
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: 400 });
}

export async function DELETE(req: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return (await revokeInvite(actor, id)) ? Response.json({ ok: true }) : Response.json({ error: "Not found or not yours to withdraw." }, { status: 404 });
}
