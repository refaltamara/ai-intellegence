import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { listConversations } from "@/chat/persist";
import { currentSession } from "@/auth/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's own conversations only. */
export async function GET() {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await listConversations(DEFAULT_WORKSPACE_ID, session.uid, 12));
}
