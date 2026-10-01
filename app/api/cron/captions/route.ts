/**
 * Vercel Cron, every 10 minutes: read captions (product, campaign or event, offer, hook, angle) in every
 * category workspace that switched caption reading on (`settings.captions.enabled`), within a time budget.
 * It does nothing when nothing is waiting. Protected by CRON_SECRET like the other crons. `?workspace=<id>`
 * restricts to one workspace, `?budget=<seconds>` caps the run (default 240), `?batch=` / `?parallel=`
 * shape each round.
 */
import { readCaptions } from "@/captions/run";
import { listWorkspaces } from "@/workspace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return Response.json({ error: "no model credentials" }, { status: 500 });
  const url = new URL(req.url);
  const only = url.searchParams.get("workspace");
  const budgetS = Math.min(280, Math.max(10, Number(url.searchParams.get("budget") ?? 240) || 240));
  const num = (name: string, lo: number, hi: number) => {
    const v = Number(url.searchParams.get(name));
    return Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined;
  };
  const started = Date.now();
  const out = [];
  for (const w of await listWorkspaces()) {
    if (w.kind === "profile" || (only && w.id !== only)) continue;
    const left = budgetS * 1000 - (Date.now() - started);
    if (left < 5000) break;
    out.push(await readCaptions(w.id, { budgetMs: left, batchSize: num("batch", 5, 60), parallel: num("parallel", 1, 16) }));
  }
  return Response.json({ workspaces: out, duration_ms: Date.now() - started });
}
