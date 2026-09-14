/** POST { workspace_id } lets an owner act in another workspace (Fair staff across clients). Members never leave their own. */
import { currentSession, wsCookieHeader } from "@/auth/current";
import { getWorkspace } from "@/workspace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (session.role !== "owner") return Response.json({ error: "Only owners can switch workspaces." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { workspace_id?: string | null };
  const id = body.workspace_id ? String(body.workspace_id) : null;
  if (id && !(await getWorkspace(id))) return Response.json({ error: `Unknown workspace ${id}` }, { status: 400 });
  const back = !id || id === session.ws;
  return Response.json({ workspace_id: back ? session.ws : id }, { headers: { "Set-Cookie": wsCookieHeader(back ? null : id) } });
}
