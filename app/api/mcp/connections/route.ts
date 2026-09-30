/** DELETE ?id=<token id> disconnects one app for the signed-in person. */
import { currentSession } from "@/auth/current";
import { revokeConnection } from "@/mcp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Unknown connection" }, { status: 400 });
  return (await revokeConnection(session.uid, id)) ? Response.json({ ok: true }) : Response.json({ error: "Unknown connection" }, { status: 404 });
}
