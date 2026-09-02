import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { listConversations } from "@/chat/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listConversations(DEFAULT_WORKSPACE_ID, 12));
}
