/**
 * Signals from the browser (src/learning/kinds.ts, the kinds marked `client`): a tile seen
 * for two seconds, Show chart, an answer copied, the evidence pane opened, a filter
 * changed. POST { items: [{ kind, payload }] }, at most 20 at a time; the workspace and
 * role are the session's, never the body's, and each payload is cleaned on the server.
 */
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { CLIENT_KINDS, type SignalKind } from "@/learning/kinds";
import { by, signals } from "@/learning/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return new Response(null, { status: 204 });
  const role = await currentRole(ws);
  if (!can(actor, "role.use", { workspace: ws, role: role.id })) return new Response(null, { status: 204 });
  const b = (await req.json().catch(() => ({}))) as { items?: { kind?: unknown; payload?: unknown }[] };
  const items = (Array.isArray(b.items) ? b.items : [])
    .slice(0, 20)
    .filter((i): i is { kind: SignalKind; payload?: Record<string, unknown> } => (CLIENT_KINDS as string[]).includes(i?.kind as string))
    .map((i) => ({ kind: i.kind, payload: i.payload && typeof i.payload === "object" && !Array.isArray(i.payload) ? (i.payload as Record<string, unknown>) : {} }));
  if (items.length) await signals(by(actor, ws, role.id), items);
  return new Response(null, { status: 204 });
}
