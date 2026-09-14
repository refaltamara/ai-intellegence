/**
 * Vercel Cron, daily at 06:00 WIB: rewrite the brief when the data has changed
 * since the last one. Protected by CRON_SECRET like the agents cron.
 */
import { ensureBrief } from "@/brief/generate";
import { listWorkspaces } from "@/workspace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const out: Record<string, unknown>[] = [];
  for (const w of await listWorkspaces()) {
    try {
      const r = await ensureBrief(w.id);
      out.push({ workspace: w.id, brief_id: r.brief.id, fresh: r.fresh, reason: r.reason, quiet: r.brief.quiet });
    } catch (e) {
      out.push({ workspace: w.id, error: (e as Error).message });
    }
  }
  return Response.json({ workspaces: out, duration_ms: Date.now() - started });
}
