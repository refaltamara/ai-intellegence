import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { getConversation, listMessages } from "@/chat/persist";
import { currentSession } from "@/auth/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const conversation = await getConversation(id, DEFAULT_WORKSPACE_ID, session.uid);
  if (!conversation) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ conversation, messages: await listMessages(id) });
}
