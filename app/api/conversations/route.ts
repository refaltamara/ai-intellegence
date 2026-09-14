import { listConversations } from "@/chat/persist";
import { currentSession, currentWorkspaceId } from "@/auth/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's own conversations only. */
export async function GET() {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await listConversations(ws, session.uid, 12));
}
