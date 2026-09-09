/** GET the current brief (writing one if the data moved); POST forces a refresh, at most once an hour. */
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { ensureBrief } from "@/brief/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const r = await ensureBrief(DEFAULT_WORKSPACE_ID);
  return Response.json({ ...r.brief, fresh: r.fresh, reason: r.reason });
}

export async function POST() {
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const r = await ensureBrief(DEFAULT_WORKSPACE_ID, { force: true });
  return Response.json({ ...r.brief, fresh: r.fresh, reason: r.reason });
}
