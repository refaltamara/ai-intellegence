import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { draftFromText } from "@/agents/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { text, email? } -> { draft } via the model, or { error } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; email?: string };
  if (!body.text?.trim()) return Response.json({ error: "text is required" }, { status: 400 });
  const r = await draftFromText(body.text, DEFAULT_WORKSPACE_ID, { email: body.email });
  return Response.json(r, { status: "error" in r ? 422 : 200 });
}
