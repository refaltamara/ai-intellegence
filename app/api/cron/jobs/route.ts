/**
 * The job runner (CMS plan, "Jobs without pg-boss"): first looks for scraper deliveries and queues their loads
 * (src/loader/intake.ts), then claims jobs one slice at a time for about 50 seconds, then keeps live extensions current.
 * Protected by CRON_SECRET.
 */
import { claimJob, refreshLive, runSlice } from "@/extensions/jobs";
import { intake } from "@/loader/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const delivered = await intake().catch((e) => [{ error: (e as Error).message }]);
  const ran: Record<string, unknown>[] = [];
  while (Date.now() - started < 50_000) {
    const job = await claimJob();
    if (!job) break;
    const r = await runSlice(job);
    ran.push({ job: job.id, kind: job.kind, ...r });
  }
  const refreshed = Date.now() - started < 120_000 ? await refreshLive() : [];
  return Response.json({ delivered, ran, refreshed });
}
