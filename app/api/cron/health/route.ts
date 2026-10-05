/** Nightly health checks (CMS plan, "Health") for every workspace that is live or in review. Protected by CRON_SECRET. */
import { sql } from "@/db/client";
import { recordHealth } from "@/onboard/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const ws = (await sql.query("select id from workspaces where status in ('live','review') order by created_at")) as { id: string }[];
  const out: Record<string, unknown>[] = [];
  for (const w of ws) {
    const h = await recordHealth(w.id).catch((e) => ({ error: (e as Error).message }) as never);
    out.push({ ws: w.id, ...("checks" in (h as object) ? { warn: (h as { checks: { status: string }[] }).checks.filter((c) => c.status !== "ok" && c.status !== "info").length } : h) });
  }
  return Response.json({ ran: out });
}
