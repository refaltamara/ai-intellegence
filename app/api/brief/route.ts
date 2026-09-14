/** GET the current brief (writing one if the data moved); POST forces a refresh, at most once an hour. */
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { ensureBrief } from "@/brief/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const ws = await currentWorkspaceId();
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const r = await ensureBrief(ws);
  return Response.json({ ...r.brief, fresh: r.fresh, reason: r.reason });
}

export async function POST() {
  const ws = await currentWorkspaceId();
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const r = await ensureBrief(ws, { force: true });
  return Response.json({ ...r.brief, fresh: r.fresh, reason: r.reason });
}
