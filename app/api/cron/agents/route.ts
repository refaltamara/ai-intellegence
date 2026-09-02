/**
 * Vercel Cron entry point (DECISIONS): runs every due agent. Protected by
 * CRON_SECRET (Vercel sends it as `Authorization: Bearer <CRON_SECRET>`).
 */
import { runAgent } from "@/agents/runner";
import { dueAgents } from "@/agents/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const due = await dueAgents(null);
  const results: Record<string, unknown>[] = [];
  for (const agent of due) {
    try {
      const o = await runAgent(agent, { reason: "schedule" });
      results.push({ agent: agent.id, name: agent.name, status: o.result_status, new: o.diff?.new.length ?? 0, gone: o.diff?.gone.length ?? 0, changed: o.diff?.changed.length ?? 0, delivered: o.delivered.filter((d) => d.ok).map((d) => d.channel), error: o.run.delivery_error });
    } catch (e) {
      results.push({ agent: agent.id, name: agent.name, error: (e as Error).message });
    }
  }
  return Response.json({ due: due.length, ran: results, duration_ms: Date.now() - started });
}
