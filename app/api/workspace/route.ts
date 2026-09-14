/**
 * Workspace settings. For now: the client brand — the brand CeMO is on the side of.
 * Default none; the owner sets it. Discovery's default exclusion, the "for you"
 * column and the analyst's stance all follow from it.
 */
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { sql } from "@/db/client";
import { invalidateSystem } from "@/chat/loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const [row] = (await sql.query("select w.client_brand_id, b.name as client_name from workspaces w left join brands b on b.id = w.client_brand_id where w.id = $1", [ws])) as { client_brand_id: string | null; client_name: string | null }[];
  return Response.json({ client_brand_id: row?.client_brand_id ?? null, client_name: row?.client_name ?? null });
}

export async function PATCH(req: Request) {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (session.role !== "owner") return Response.json({ error: "Only the owner can change the client brand." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { client_brand_id?: string | null };
  const id = body.client_brand_id ? String(body.client_brand_id).trim() : null;
  if (id) {
    const found = (await sql.query("select id from brands where workspace_id = $1 and id = $2", [ws, id])) as { id: string }[];
    if (!found.length) return Response.json({ error: `Unknown brand ${id}` }, { status: 400 });
  }
  await sql.query("update workspaces set client_brand_id = $2 where id = $1", [ws, id]);
  await sql.query("update brands set is_client = (id = $2) where workspace_id = $1", [ws, id ?? ""]);
  invalidateSystem(ws);
  const [b] = id ? ((await sql.query("select name from brands where id = $1", [id])) as { name: string }[]) : [null];
  return Response.json({ client_brand_id: id, client_name: b?.name ?? null });
}
